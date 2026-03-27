import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/supabase-storage";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { format } from "date-fns";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return format(new Date(d), "dd MMM yyyy");
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "_");
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds || !accessibleIds.includes(params.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Fetch all property data in parallel ────────────────────────────────────
  const [property, incomeEntries, expenseEntries, tenants, ownerInvoices, pettyCash, documents] =
    await Promise.all([
      prisma.property.findUnique({
        where: { id: params.id },
        include: {
          units: { orderBy: { unitNumber: "asc" } },
          owner:   { select: { name: true, email: true } },
          manager: { select: { name: true, email: true } },
        },
      }),
      prisma.incomeEntry.findMany({
        where: { unit: { propertyId: params.id } },
        include: { unit: true, tenant: { select: { name: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.expenseEntry.findMany({
        where: { propertyId: params.id },
        include: { unit: true },
        orderBy: { date: "asc" },
      }),
      prisma.tenant.findMany({
        where: { unit: { propertyId: params.id } },
        include: { unit: { select: { unitNumber: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ownerInvoice.findMany({
        where: { propertyId: params.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.pettyCash.findMany({
        where: { propertyId: params.id },
        orderBy: { date: "asc" },
      }),
      prisma.tenantDocument.findMany({
        where: { tenant: { unit: { propertyId: params.id } } },
        include: { tenant: { include: { unit: { select: { unitNumber: true } } } } },
      }),
    ]);

  if (!property) return Response.json({ error: "Not found" }, { status: 404 });

  // ── Build XLSX workbook ────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Summary
  const summaryRows = [
    ["Property Handover Package"],
    [],
    ["Property Name",  property.name],
    ["Address",        property.address ?? ""],
    ["City",           property.city ?? ""],
    ["Type",           property.type],
    ["Total Units",    property.units.length],
    ["Total Tenants",  tenants.length],
    ["Owner",          property.owner?.name ?? ""],
    ["Manager",        property.manager?.name ?? ""],
    ["Export Date",    fmtDate(new Date())],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Sheet 2 — Income Ledger
  const incomeHeaders = ["Date", "Type", "Tenant", "Unit", "Gross Amount (KSh)", "Commission (KSh)", "Net Amount (KSh)", "Platform", "Check-In", "Check-Out", "Notes"];
  const incomeRows = incomeEntries.map((e) => [
    fmtDate(e.date),
    e.type,
    e.tenant?.name ?? "",
    e.unit?.unitNumber ?? "",
    e.grossAmount,
    e.agentCommission ?? 0,
    e.grossAmount - (e.agentCommission ?? 0),
    e.platform ?? "",
    fmtDate(e.checkIn),
    fmtDate(e.checkOut),
    e.note ?? "",
  ]);
  const wsIncome = XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows]);
  wsIncome["!cols"] = [12,18,20,10,18,18,18,14,12,12,30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsIncome, "Income Ledger");

  // Sheet 3 — Expense Ledger
  const expenseHeaders = ["Date", "Category", "Description", "Amount (KSh)", "Scope", "Unit", "Sunk Cost"];
  const expenseRows = expenseEntries.map((e) => [
    fmtDate(e.date),
    e.category,
    e.description ?? "",
    e.amount,
    e.scope,
    e.unit?.unitNumber ?? "",
    e.isSunkCost ? "Yes" : "No",
  ]);
  const wsExpense = XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]);
  wsExpense["!cols"] = [12,18,30,16,12,10,12].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsExpense, "Expense Ledger");

  // Sheet 4 — Tenant Directory
  const tenantHeaders = ["Name", "Email", "Phone", "Unit", "Monthly Rent (KSh)", "Service Charge (KSh)", "Deposit (KSh)", "Lease Start", "Lease End", "Status", "Renewal Stage"];
  const tenantRows = tenants.map((t) => [
    t.name,
    t.email ?? "",
    t.phone ?? "",
    t.unit.unitNumber,
    t.monthlyRent,
    t.serviceCharge ?? 0,
    t.depositAmount ?? 0,
    fmtDate(t.leaseStart),
    fmtDate(t.leaseEnd),
    t.isActive ? "Active" : "Vacated",
    t.renewalStage,
  ]);
  const wsTenants = XLSX.utils.aoa_to_sheet([tenantHeaders, ...tenantRows]);
  wsTenants["!cols"] = [22,25,15,10,18,18,16,14,14,10,16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsTenants, "Tenant Directory");

  // Sheet 5 — Owner Invoices
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const invoiceHeaders = ["Invoice #", "Type", "Period", "Total Amount (KSh)", "Due Date", "Status", "Paid At", "Paid Amount (KSh)"];
  const invoiceRows = ownerInvoices.map((inv) => [
    inv.invoiceNumber,
    inv.type,
    `${MONTH_NAMES[inv.periodMonth - 1]} ${inv.periodYear}`,
    inv.totalAmount,
    fmtDate(inv.dueDate),
    inv.status,
    fmtDate(inv.paidAt),
    inv.paidAmount ?? "",
  ]);
  const wsInvoices = XLSX.utils.aoa_to_sheet([invoiceHeaders, ...invoiceRows]);
  wsInvoices["!cols"] = [18,20,14,18,14,12,14,18].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsInvoices, "Owner Invoices");

  // Sheet 6 — Petty Cash
  const pcHeaders = ["Date", "Type", "Description", "Amount (KSh)"];
  const pcRows = pettyCash.map((p) => [
    fmtDate(p.date),
    p.type,
    p.description,
    p.amount,
  ]);
  const wsPc = XLSX.utils.aoa_to_sheet([pcHeaders, ...pcRows]);
  wsPc["!cols"] = [14, 8, 40, 16].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsPc, "Petty Cash");

  // Sheet 7 — Tenant Documents (index)
  const docHeaders = ["Tenant", "Unit", "Category", "Label", "File Name", "Uploaded"];
  const docRows = documents.map((d) => [
    d.tenant.name,
    d.tenant.unit.unitNumber,
    d.category,
    d.label,
    d.fileName,
    fmtDate(d.uploadedAt),
  ]);
  const wsDocs = XLSX.utils.aoa_to_sheet([docHeaders, ...docRows]);
  wsDocs["!cols"] = [22, 10, 18, 25, 30, 14].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsDocs, "Tenant Documents");

  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // ── Fetch document files from Supabase and bundle into ZIP ─────────────────
  const zip = new JSZip();
  const dataFolder = zip.folder("data")!;
  const docsFolder = zip.folder("documents")!;

  dataFolder.file(`PropertyHandover_${slug(property.name)}.xlsx`, xlsxBuffer);

  // Download each document file (best-effort — skip if unavailable)
  await Promise.allSettled(
    documents.map(async (doc) => {
      try {
        const url = await getSignedUrl(doc.storagePath, 300);
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const folderName = `${slug(doc.tenant.unit.unitNumber)}_${slug(doc.tenant.name)}`;
        const fileName   = `${slug(doc.label)}_${doc.fileName}`;
        docsFolder.folder(folderName)!.file(fileName, buf);
      } catch {
        // skip missing or unavailable files
      }
    })
  );

  // README
  const readme = [
    "Property Handover Package",
    "=========================",
    `Property:    ${property.name}`,
    `Address:     ${property.address ?? ""}${property.city ? `, ${property.city}` : ""}`,
    `Type:        ${property.type}`,
    `Units:       ${property.units.length}`,
    `Tenants:     ${tenants.length} (all time)`,
    `Exported:    ${fmtDate(new Date())}`,
    `Exported by: ${session!.user.email}`,
    "",
    "Contents",
    "--------",
    `data/PropertyHandover_${slug(property.name)}.xlsx`,
    "  Sheet 1: Summary",
    "  Sheet 2: Income Ledger (full history)",
    "  Sheet 3: Expense Ledger (full history)",
    "  Sheet 4: Tenant Directory",
    "  Sheet 5: Owner Invoices",
    "  Sheet 6: Petty Cash",
    "  Sheet 7: Tenant Documents (index)",
    "",
    `documents/  — ${documents.length} tenant document file(s)`,
    "",
    "Generated by Property Manager",
  ].join("\n");

  zip.file("README.txt", readme);

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const dateStr = format(new Date(), "yyyyMMdd");
  const filename = `PropertyHandover_${slug(property.name)}_${dateStr}.zip`;

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type":        "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
