import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { uploadToStorage } from "@/lib/supabase-storage";
import * as XLSX from "xlsx";
import JSZip from "jszip";

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  // XLSX may return a date serial number
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  const d = new Date(str(v));
  return isNaN(d.getTime()) ? null : d;
}

/** Parse "Mar 2026" → { year: 2026, month: 3 } */
function parsePeriod(s: string): { year: number; month: number } | null {
  const MONTHS: Record<string, number> = {
    jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
    jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  };
  const parts = s.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const m = MONTHS[parts[0].toLowerCase().slice(0, 3)];
  const y = parseInt(parts[1]);
  if (!m || isNaN(y)) return null;
  return { year: y, month: m };
}

function generateInvoiceNumber(year: number, month: number, seq: number) {
  return `OWN-${year}${String(month).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
}

const VALID_INCOME_TYPES = new Set([
  "LONGTERM_RENT","SERVICE_CHARGE","DEPOSIT","AIRBNB","UTILITY_RECOVERY","OTHER",
  "LETTING_FEE","RENEWAL_FEE","VACANCY_FEE","SETUP_FEE_INSTALMENT","CONSULTANCY_FEE",
]);
const VALID_EXPENSE_CATS = new Set([
  "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY","CLEANER",
  "CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
]);
const VALID_EXPENSE_SCOPES = new Set(["UNIT","PROPERTY","PORTFOLIO"]);
const VALID_OWNER_INV_TYPES = new Set([
  "LETTING_FEE","PERIODIC_LETTING_FEE","RENEWAL_FEE","MANAGEMENT_FEE",
  "VACANCY_FEE","SETUP_FEE_INSTALMENT","CONSULTANCY_FEE",
]);
const VALID_DOC_CATS = new Set([
  "LEASE_AGREEMENT","ID_COPY","TAX_ID","PAYMENT_RECEIPT",
  "RENEWAL_NOTICE","CORRESPONDENCE","OTHER",
]);
const VALID_PLATFORMS = new Set(["AIRBNB","BOOKING_COM","DIRECT","AGENT"]);

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return Response.json({ error: "File must be a .zip handover package" }, { status: 400 });
  }

  // Cap the raw upload size before we even buffer it. Next's default body
  // limit is small but multipart goes through a different path; be defensive.
  const MAX_ZIP_BYTES        = 25 * 1024 * 1024; // 25 MB compressed
  const MAX_DECOMPRESSED     = 100 * 1024 * 1024; // 100 MB total uncompressed
  const MAX_ENTRY_BYTES      = 50 * 1024 * 1024; // 50 MB per entry
  const MAX_ENTRIES          = 1000;
  if (file.size > MAX_ZIP_BYTES) {
    return Response.json({ error: "ZIP exceeds 25 MB upload limit" }, { status: 413 });
  }

  const zipBuffer = Buffer.from(await file.arrayBuffer());
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    return Response.json({ error: "Could not parse ZIP file" }, { status: 400 });
  }

  // ZIP-bomb guard: walk every entry, sum uncompressed sizes, reject if any
  // single entry or the total exceeds limits. Also reject path traversal and
  // absolute paths in entry names.
  let entryCount = 0;
  let totalUncompressed = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    entryCount++;
    if (entryCount > MAX_ENTRIES) {
      return Response.json({ error: "ZIP contains too many entries" }, { status: 400 });
    }
    if (name.includes("..") || name.startsWith("/") || name.includes("\\")) {
      return Response.json({ error: "ZIP contains unsafe paths" }, { status: 400 });
    }
    // JSZip exposes uncompressed size on the internal _data object
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (size > MAX_ENTRY_BYTES) {
      return Response.json({ error: "ZIP entry exceeds size limit" }, { status: 400 });
    }
    totalUncompressed += size;
    if (totalUncompressed > MAX_DECOMPRESSED) {
      return Response.json({ error: "ZIP decompressed size exceeds 100 MB limit" }, { status: 400 });
    }
  }

  // Find the XLSX inside data/
  const xlsxEntry = zip.file(/data\/.*\.xlsx$/i)[0];
  if (!xlsxEntry) {
    return Response.json({ error: "No XLSX found in the data/ folder of the ZIP" }, { status: 400 });
  }

  const xlsxBuffer = await xlsxEntry.async("nodebuffer");
  const wb = XLSX.read(xlsxBuffer, { type: "buffer", cellDates: true });

  const errors: { sheet: string; row: number; reason: string }[] = [];
  const summary = { units: 0, tenants: 0, incomeEntries: 0, expenseEntries: 0, pettyCash: 0, ownerInvoices: 0, documents: 0 };

  // ── 1. Summary sheet → property ──────────────────────────────────────────
  const summarySheet = wb.Sheets["Summary"];
  if (!summarySheet) return Response.json({ error: "Summary sheet not found in XLSX" }, { status: 400 });

  const summaryRows = XLSX.utils.sheet_to_json<unknown[]>(summarySheet, { header: 1 }) as unknown[][];
  const summaryMap: Record<string, string> = {};
  for (const row of summaryRows) {
    if (Array.isArray(row) && row.length >= 2) {
      summaryMap[str(row[0])] = str(row[1]);
    }
  }

  const propName    = summaryMap["Property Name"];
  const propAddress = summaryMap["Address"] || null;
  const propCity    = summaryMap["City"] || null;
  const propTypeRaw = summaryMap["Type"];

  if (!propName) return Response.json({ error: "Property Name not found in Summary sheet" }, { status: 400 });
  if (propTypeRaw !== "AIRBNB" && propTypeRaw !== "LONGTERM") {
    return Response.json({ error: `Unknown property type "${propTypeRaw}" in Summary sheet (expected AIRBNB or LONGTERM)` }, { status: 400 });
  }

  // Check for duplicate property name
  const existing = await prisma.property.findFirst({ where: { name: { equals: propName, mode: "insensitive" } } });
  if (existing) {
    return Response.json(
      { error: `A property named "${propName}" already exists. Rename it in the XLSX Summary sheet before importing.` },
      { status: 409 }
    );
  }

  // Create property
  const property = await prisma.property.create({
    data: {
      name:    propName,
      type:    propTypeRaw as "AIRBNB" | "LONGTERM",
      address: propAddress,
      city:    propCity,
    },
  });

  // Grant access to the importing manager
  await prisma.propertyAccess.create({
    data: { userId: session!.user.id, propertyId: property.id },
  });

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email,
    action:     "CREATE",
    resource:   "Property",
    resourceId: property.id,
    organizationId: session!.user.organizationId,
    after:      { name: propName, type: propTypeRaw, source: "handover_import" },
  });

  // ── 2. Collect all unit numbers ───────────────────────────────────────────
  const unitNumbers = new Set<string>();
  // From Tenant Directory
  const tenantSheet = wb.Sheets["Tenant Directory"];
  const tenantRows = tenantSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(tenantSheet, { defval: "" }) : [];
  for (const row of tenantRows) {
    const u = str(row["Unit"]); if (u) unitNumbers.add(u);
  }
  // From Income Ledger
  const incomeSheet = wb.Sheets["Income Ledger"];
  const incomeRows = incomeSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(incomeSheet, { defval: "" }) : [];
  for (const row of incomeRows) {
    const u = str(row["Unit"]); if (u) unitNumbers.add(u);
  }
  // From Expense Ledger (UNIT scope only)
  const expenseSheet = wb.Sheets["Expense Ledger"];
  const expenseRows = expenseSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(expenseSheet, { defval: "" }) : [];
  for (const row of expenseRows) {
    const u = str(row["Unit"]); if (u) unitNumbers.add(u);
  }

  // Active unit numbers from tenant directory (to set status)
  const activeUnitNumbers = new Set<string>();
  for (const row of tenantRows) {
    if (str(row["Status"]).toLowerCase() === "active") {
      const u = str(row["Unit"]); if (u) activeUnitNumbers.add(u);
    }
  }

  // Create units
  const unitMap = new Map<string, string>(); // unitNumber → id
  for (const unitNumber of Array.from(unitNumbers)) {
    try {
      const unit = await prisma.unit.create({
        data: {
          unitNumber,
          propertyId: property.id,
          type:       "OTHER",
          status:     activeUnitNumbers.has(unitNumber) ? "ACTIVE" : "VACANT",
        },
      });
      unitMap.set(unitNumber, unit.id);
      summary.units++;
    } catch (e) {
      errors.push({ sheet: "Units", row: 0, reason: `Could not create unit ${unitNumber}: ${(e as Error).message}` });
    }
  }

  // ── 3. Tenants ────────────────────────────────────────────────────────────
  // tenantName → id map for later use (income resolution, document matching)
  const tenantNameMap = new Map<string, string>(); // lowerName → tenantId

  for (let i = 0; i < tenantRows.length; i++) {
    const row = tenantRows[i];
    const name = str(row["Name"]);
    const unitNumber = str(row["Unit"]);
    if (!name || !unitNumber) {
      errors.push({ sheet: "Tenant Directory", row: i + 2, reason: "Name and Unit are required" });
      continue;
    }
    const unitId = unitMap.get(unitNumber);
    if (!unitId) {
      errors.push({ sheet: "Tenant Directory", row: i + 2, reason: `Unit "${unitNumber}" not found` });
      continue;
    }
    const isActive = str(row["Status"]).toLowerCase() === "active";
    const leaseStart = parseDate(row["Lease Start"]) ?? new Date();
    const leaseEnd   = parseDate(row["Lease End"]);
    try {
      const tenant = await prisma.tenant.create({
        data: {
          name,
          unitId,
          email:         str(row["Email"]) || null,
          phone:         str(row["Phone"]) || null,
          monthlyRent:   num(row["Monthly Rent (KSh)"]),
          serviceCharge: num(row["Service Charge (KSh)"]),
          depositAmount: num(row["Deposit (KSh)"]),
          leaseStart,
          leaseEnd,
          isActive,
        },
      });
      tenantNameMap.set(name.toLowerCase(), tenant.id);
      summary.tenants++;
    } catch (e) {
      errors.push({ sheet: "Tenant Directory", row: i + 2, reason: (e as Error).message });
    }
  }

  // ── 4. Income entries ─────────────────────────────────────────────────────
  for (let i = 0; i < incomeRows.length; i++) {
    const row = incomeRows[i];
    const unitNumber = str(row["Unit"]);
    const unitId = unitMap.get(unitNumber);
    if (!unitId) {
      errors.push({ sheet: "Income Ledger", row: i + 2, reason: `Unit "${unitNumber}" not found` });
      continue;
    }
    const date = parseDate(row["Date"]);
    if (!date) { errors.push({ sheet: "Income Ledger", row: i + 2, reason: "Invalid date" }); continue; }

    const typeRaw = str(row["Type"]).toUpperCase().replace(/ /g, "_");
    const type = VALID_INCOME_TYPES.has(typeRaw) ? typeRaw : "OTHER";
    const grossAmount = num(row["Gross Amount (KSh)"]);
    if (grossAmount <= 0) { errors.push({ sheet: "Income Ledger", row: i + 2, reason: "Gross amount must be positive" }); continue; }

    // Duplicate check: same unitId + date (day) + type + grossAmount
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(date); dayEnd.setHours(23,59,59,999);
    const dup = await prisma.incomeEntry.findFirst({
      where: { unitId, date: { gte: dayStart, lte: dayEnd }, type: type as never, grossAmount },
    });
    if (dup) { summary.incomeEntries++; continue; } // already exists (idempotent re-run)

    const tenantName = str(row["Tenant"]);
    const tenantId   = tenantName ? (tenantNameMap.get(tenantName.toLowerCase()) ?? null) : null;
    const platformRaw = str(row["Platform"]).toUpperCase().replace(/ /g, "_");
    const platform = VALID_PLATFORMS.has(platformRaw) ? platformRaw : null;

    try {
      await prisma.incomeEntry.create({
        data: {
          date,
          unitId,
          tenantId,
          type:            type as never,
          grossAmount,
          agentCommission: num(row["Commission (KSh)"]),
          platform:        platform as never,
          checkIn:         parseDate(row["Check-In"]),
          checkOut:        parseDate(row["Check-Out"]),
          note:            str(row["Notes"]) || null,
        },
      });
      summary.incomeEntries++;
    } catch (e) {
      errors.push({ sheet: "Income Ledger", row: i + 2, reason: (e as Error).message });
    }
  }

  // ── 5. Expense entries ────────────────────────────────────────────────────
  for (let i = 0; i < expenseRows.length; i++) {
    const row = expenseRows[i];
    const date = parseDate(row["Date"]);
    if (!date) { errors.push({ sheet: "Expense Ledger", row: i + 2, reason: "Invalid date" }); continue; }

    const catRaw   = str(row["Category"]).toUpperCase().replace(/ /g, "_");
    const category = VALID_EXPENSE_CATS.has(catRaw) ? catRaw : "OTHER";
    const scopeRaw = str(row["Scope"]).toUpperCase();
    const scope    = VALID_EXPENSE_SCOPES.has(scopeRaw) ? scopeRaw : "PROPERTY";
    const amount   = num(row["Amount (KSh)"]);

    // Duplicate check
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(date); dayEnd.setHours(23,59,59,999);
    const dup = await prisma.expenseEntry.findFirst({
      where: { date: { gte: dayStart, lte: dayEnd }, category: category as never, amount },
    });
    if (dup) { summary.expenseEntries++; continue; }

    const unitNumber = str(row["Unit"]);
    const unitId = (scope === "UNIT" && unitNumber) ? (unitMap.get(unitNumber) ?? null) : null;

    try {
      await prisma.expenseEntry.create({
        data: {
          date,
          scope:       scope as never,
          category:    category as never,
          amount,
          description: str(row["Description"]) || null,
          isSunkCost:  str(row["Sunk Cost"]).toLowerCase() === "yes",
          propertyId:  property.id,
          unitId,
        },
      });
      summary.expenseEntries++;
    } catch (e) {
      errors.push({ sheet: "Expense Ledger", row: i + 2, reason: (e as Error).message });
    }
  }

  // ── 6. Petty cash ─────────────────────────────────────────────────────────
  const pcSheet = wb.Sheets["Petty Cash"];
  const pcRows  = pcSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(pcSheet, { defval: "" }) : [];

  for (let i = 0; i < pcRows.length; i++) {
    const row = pcRows[i];
    const date = parseDate(row["Date"]);
    if (!date) { errors.push({ sheet: "Petty Cash", row: i + 2, reason: "Invalid date" }); continue; }

    const typeRaw = str(row["Type"]).toUpperCase();
    if (typeRaw !== "IN" && typeRaw !== "OUT") {
      errors.push({ sheet: "Petty Cash", row: i + 2, reason: `Invalid type "${typeRaw}" (expected IN or OUT)` });
      continue;
    }
    const description = str(row["Description"]);
    const amount      = num(row["Amount (KSh)"]);

    // Duplicate check
    const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(date); dayEnd.setHours(23,59,59,999);
    const dup = await prisma.pettyCash.findFirst({
      where: { date: { gte: dayStart, lte: dayEnd }, type: typeRaw as never, description, amount },
    });
    if (dup) { summary.pettyCash++; continue; }

    try {
      await prisma.pettyCash.create({
        data: { date, type: typeRaw as never, description, amount, propertyId: property.id },
      });
      summary.pettyCash++;
    } catch (e) {
      errors.push({ sheet: "Petty Cash", row: i + 2, reason: (e as Error).message });
    }
  }

  // ── 7. Owner invoices (SENT/PAID/OVERDUE only) ────────────────────────────
  const invSheet = wb.Sheets["Owner Invoices"];
  const invRows  = invSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(invSheet, { defval: "" }) : [];

  for (let i = 0; i < invRows.length; i++) {
    const row = invRows[i];
    const status = str(row["Status"]).toUpperCase();
    if (status === "DRAFT" || status === "CANCELLED") continue; // skip

    const period = parsePeriod(str(row["Period"]));
    if (!period) { errors.push({ sheet: "Owner Invoices", row: i + 2, reason: `Cannot parse period "${str(row["Period"])}"` }); continue; }

    const typeRaw = str(row["Type"]).toUpperCase().replace(/ /g, "_");
    const type = VALID_OWNER_INV_TYPES.has(typeRaw) ? typeRaw : null;
    if (!type) { errors.push({ sheet: "Owner Invoices", row: i + 2, reason: `Unknown invoice type "${str(row["Type"])}"` }); continue; }

    const totalAmount = num(row["Total Amount (KSh)"]);
    const dueDate     = parseDate(row["Due Date"]) ?? new Date();
    const paidAt      = parseDate(row["Paid At"]);
    const paidAmount  = num(row["Paid Amount (KSh)"]) || null;
    const validStatuses = new Set(["SENT","PAID","OVERDUE"]);
    const finalStatus = validStatuses.has(status) ? status : "SENT";

    try {
      const seq = await prisma.ownerInvoice.count({ where: { periodYear: period.year, periodMonth: period.month } });
      const invoiceNumber = generateInvoiceNumber(period.year, period.month, seq + 1);
      await prisma.ownerInvoice.create({
        data: {
          invoiceNumber,
          propertyId:  property.id,
          type:        type as never,
          periodYear:  period.year,
          periodMonth: period.month,
          lineItems:   [{ description: str(row["Type"]), amount: totalAmount, unitId: null, tenantId: null, incomeType: "OTHER" }] as never,
          totalAmount,
          dueDate,
          status:      finalStatus as never,
          paidAt:      paidAt ?? null,
          paidAmount,
        },
      });
      summary.ownerInvoices++;
    } catch (e) {
      errors.push({ sheet: "Owner Invoices", row: i + 2, reason: (e as Error).message });
    }
  }

  // ── 8. Tenant documents (best-effort) ─────────────────────────────────────
  const docIndexSheet = wb.Sheets["Tenant Documents"];
  const docIndexRows  = docIndexSheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(docIndexSheet, { defval: "" })
    : [];

  // Build index: filename → { category, label }
  const docIndex = new Map<string, { category: string; label: string }>();
  for (const row of docIndexRows) {
    const fn  = str(row["File Name"]);
    const cat = str(row["Category"]).toUpperCase().replace(/ /g, "_");
    if (fn) docIndex.set(fn, {
      category: VALID_DOC_CATS.has(cat) ? cat : "OTHER",
      label:    str(row["Label"]) || fn,
    });
  }

  // Iterate documents/ folder in ZIP
  const docFiles: { path: string; file: JSZip.JSZipObject }[] = [];
  zip.folder("documents")?.forEach((relativePath, f) => {
    if (!f.dir) docFiles.push({ path: relativePath, file: f });
  });

  for (const { path, file } of docFiles) {
    // path like "Unit_4A_JohnDoe/lease_agreement.pdf"
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    if (!fileName) continue;

    // Extract tenant name from folder name (everything after first underscore-separated segment)
    // folder format: {slug(unitNumber)}_{slug(tenantName)}
    const folderName = parts[0] ?? "";
    // Try to match tenant by fuzzy name search — the folder contains slug(tenantName)
    const folderLower = folderName.toLowerCase().replace(/_/g, " ");
    let matchedTenantId: string | null = null;
    for (const [lowerName, tid] of Array.from(tenantNameMap.entries())) {
      const sluggedName = lowerName.replace(/[^a-z0-9]/gi, " ").toLowerCase();
      if (folderLower.includes(sluggedName.slice(0, 8))) {
        matchedTenantId = tid;
        break;
      }
    }
    if (!matchedTenantId) continue; // can't match tenant, skip

    try {
      const buf = Buffer.from(await file.async("arraybuffer"));
      const mimeType = fileName.endsWith(".pdf") ? "application/pdf"
        : fileName.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : fileName.endsWith(".doc")  ? "application/msword"
        : fileName.endsWith(".png")  ? "image/png"
        : fileName.endsWith(".webp") ? "image/webp"
        : "image/jpeg";

      const storagePath = `tenants/${matchedTenantId}/${Date.now()}-${fileName}`;
      await uploadToStorage(storagePath, buf, mimeType);

      const meta = docIndex.get(fileName) ?? { category: "OTHER", label: fileName };
      await prisma.tenantDocument.create({
        data: {
          tenantId:    matchedTenantId,
          category:    meta.category as never,
          label:       meta.label,
          fileName,
          storagePath,
          fileSize:    buf.length,
          mimeType,
        },
      });
      summary.documents++;
    } catch {
      errors.push({ sheet: "Documents", row: 0, reason: `Could not upload ${fileName}` });
    }
  }

  return Response.json({ propertyId: property.id, propertyName: propName, summary, errors }, { status: 201 });
}
