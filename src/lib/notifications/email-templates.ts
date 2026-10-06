const APP_URL = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";

const NAVY  = "#132635";
const GRAY  = "#6b7280";
const LGRAY = "#9ca3af";
const RED   = "#dc2626";
const AMBER = "#d97706";

function shell(
  heading: string,
  headingColor: string,
  body: string,
  footer = "You receive these alerts because you manage this property on GroundWorkPM.",
): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:${headingColor};font-size:20px;margin-bottom:6px;">${heading}</h2>
      ${body}
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
      <p style="color:${LGRAY};font-size:11px;margin:0;">
        ${footer}
      </p>
    </div>`;
}

function cta(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin:20px 0;background:${NAVY};color:#fff;
    padding:11px 26px;border-radius:7px;text-decoration:none;font-size:14px;font-weight:600;">
    ${label} →</a>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="color:${GRAY};font-size:13px;padding:4px 0;width:140px;">${label}</td>
    <td style="color:#111827;font-size:13px;padding:4px 0;font-weight:500;">${value}</td>
  </tr>`;
}

// ─── Lease expiry ─────────────────────────────────────────────────────────────

export function leaseExpiryTemplate(data: {
  tenantName: string;
  unitRef: string;
  propertyName: string;
  leaseEnd: string;
  daysLeft: number;
  tenantId: string;
}): { subject: string; html: string } {
  const urgent = data.daysLeft <= 7;
  const color  = urgent ? RED : AMBER;
  const tag    = urgent ? `${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} left` : `${data.daysLeft} days left`;

  const subject = `${urgent ? "URGENT: " : ""}Lease expiring in ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} — ${data.tenantName}`;

  const html = shell(
    `Lease expiring soon — ${tag}`,
    color,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      The lease for <strong>${data.tenantName}</strong> is due to expire on
      <strong>${data.leaseEnd}</strong>. Please initiate a renewal discussion or
      prepare for vacancy.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Tenant", data.tenantName)}
      ${row("Unit", data.unitRef)}
      ${row("Property", data.propertyName)}
      ${row("Lease ends", data.leaseEnd)}
      ${row("Days remaining", tag)}
    </table>
    ${cta("Open tenant profile", `${APP_URL}/tenants/${data.tenantId}`)}`,
  );

  return { subject, html };
}

// ─── Invoice overdue ──────────────────────────────────────────────────────────

export function invoiceOverdueTemplate(data: {
  tenantName: string;
  unitRef: string;
  propertyName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  daysOverdue: number;
  invoiceId: string;
}): { subject: string; html: string } {
  const subject = `Overdue invoice — ${data.tenantName} (${data.daysOverdue} days)`;

  const html = shell(
    `Rent overdue — ${data.daysOverdue} days`,
    RED,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      Invoice <strong>${data.invoiceNumber}</strong> for <strong>${data.tenantName}</strong>
      was due on <strong>${data.dueDate}</strong> and has not been paid.
      Consider sending a payment reminder or opening an arrears case.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Tenant", data.tenantName)}
      ${row("Unit", data.unitRef)}
      ${row("Property", data.propertyName)}
      ${row("Invoice", data.invoiceNumber)}
      ${row("Amount due", data.amount)}
      ${row("Due date", data.dueDate)}
      ${row("Days overdue", `${data.daysOverdue} days`)}
    </table>
    ${cta("View invoice", `${APP_URL}/invoices`)}`,
  );

  return { subject, html };
}

// ─── Compliance certificate expiry ────────────────────────────────────────────

export function complianceExpiryTemplate(data: {
  certificateType: string;
  propertyName: string;
  expiryDate: string;
  daysLeft: number;
  propertyId: string;
}): { subject: string; html: string } {
  const urgent = data.daysLeft <= 7;
  const color  = urgent ? RED : AMBER;
  const tag    = `${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} left`;

  const subject = `${urgent ? "URGENT: " : ""}${data.certificateType} expiring in ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} — ${data.propertyName}`;

  const html = shell(
    `Compliance certificate expiring — ${tag}`,
    color,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      The <strong>${data.certificateType}</strong> for <strong>${data.propertyName}</strong>
      expires on <strong>${data.expiryDate}</strong>. Arrange renewal before this date
      to maintain compliance.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Certificate", data.certificateType)}
      ${row("Property", data.propertyName)}
      ${row("Expiry date", data.expiryDate)}
      ${row("Days remaining", tag)}
    </table>
    ${cta("View compliance certificates", `${APP_URL}/compliance/certificates`)}`,
  );

  return { subject, html };
}

// ─── Insurance renewal ────────────────────────────────────────────────────────

export function insuranceExpiryTemplate(data: {
  policyType: string;
  insurer: string;
  policyNumber: string;
  propertyName: string;
  endDate: string;
  daysLeft: number;
}): { subject: string; html: string } {
  const urgent = data.daysLeft <= 7;
  const color  = urgent ? RED : AMBER;
  const tag    = `${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} left`;

  const subject = `${urgent ? "URGENT: " : ""}Insurance policy expiring in ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} — ${data.propertyName}`;

  const html = shell(
    `Insurance expiring — ${tag}`,
    color,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      The <strong>${data.policyType}</strong> policy for <strong>${data.propertyName}</strong>
      with <strong>${data.insurer}</strong> expires on <strong>${data.endDate}</strong>.
      Contact your broker to arrange renewal.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Policy type", data.policyType)}
      ${row("Insurer", data.insurer)}
      ${row("Policy number", data.policyNumber)}
      ${row("Property", data.propertyName)}
      ${row("Expiry date", data.endDate)}
      ${row("Days remaining", tag)}
    </table>
    ${cta("View insurance policies", `${APP_URL}/insurance`)}`,
  );

  return { subject, html };
}

// ─── Asset warranty expiry ───────────────────────────────────────────────────

export function warrantyExpiryTemplate(data: {
  assetName: string;
  category: string;
  serialNumber: string | null;
  propertyName: string;
  unitNumber: string | null;
  expiryDate: string;
  daysLeft: number;
  assetId: string;
}): { subject: string; html: string } {
  const urgent = data.daysLeft <= 7;
  const color  = urgent ? RED : AMBER;
  const tag    = `${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} left`;

  const subject = `${urgent ? "URGENT: " : ""}Warranty ending in ${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"} — ${data.assetName}, ${data.propertyName}`;

  const html = shell(
    `Asset warranty ending — ${tag}`,
    color,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      The warranty on <strong>${data.assetName}</strong> at <strong>${data.propertyName}</strong>
      ends on <strong>${data.expiryDate}</strong>. Any faults to claim on the manufacturer should be raised before then.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Asset", data.assetName)}
      ${row("Category", data.category)}
      ${data.serialNumber ? row("Serial number", data.serialNumber) : ""}
      ${row("Property", data.unitNumber ? `${data.propertyName} · Unit ${data.unitNumber}` : data.propertyName)}
      ${row("Warranty ends", data.expiryDate)}
      ${row("Days remaining", tag)}
    </table>
    ${cta("Open the asset", `${APP_URL}/assets?focus=${data.assetId}`)}`,
  );

  return { subject, html };
}

// ─── Urgent maintenance stale ────────────────────────────────────────────────

export function pettyCashPendingTemplate(data: {
  propertyName: string;
  amount: number;
  description: string;
  receiptRef: string | null;
  submittedBy: string;
}): { subject: string; html: string } {
  const subject = `Petty Cash Approval Required — ${data.propertyName}`;
  const html = shell(
    "Petty Cash Approval Required",
    AMBER,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      A petty cash OUT entry has been submitted above the approval threshold and requires your review.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Property", data.propertyName)}
      ${row("Amount", data.amount.toLocaleString())}
      ${row("Description", data.description)}
      ${row("Receipt / Ref", data.receiptRef ?? "—")}
      ${row("Submitted by", data.submittedBy)}
    </table>
    ${cta("Review & Approve", `${APP_URL}/petty-cash`)}`,
  );
  return { subject, html };
}

export function urgentMaintenanceTemplate(data: {
  jobTitle: string;
  propertyName: string;
  unitRef: string | null;
  category: string;
  hoursOpen: number;
  jobId: string;
}): { subject: string; html: string } {
  const subject = `URGENT maintenance job still open — ${data.jobTitle} (${data.hoursOpen}h)`;

  const html = shell(
    `Urgent maintenance job unresolved`,
    RED,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      An <strong>URGENT</strong> maintenance job has been open for
      <strong>${data.hoursOpen} hour${data.hoursOpen === 1 ? "" : "s"}</strong>
      without being assigned or resolved. Please action this immediately.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Job", data.jobTitle)}
      ${row("Property", data.propertyName)}
      ${row("Unit", data.unitRef ?? "N/A")}
      ${row("Category", data.category)}
      ${row("Open for", `${data.hoursOpen} hours`)}
    </table>
    ${cta("View maintenance job", `${APP_URL}/maintenance`)}`,
  );

  return { subject, html };
}

// ─── Tenant complaint logged ──────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function complaintRaisedTemplate(data: {
  complaintId: string;
  title: string;
  description: string | null;
  categoryLabel: string;
  propertyName: string;
  unitRef: string | null;
  tenantName: string | null;
  raisedByName: string;
  source: "STAFF" | "PORTAL";
}): { subject: string; html: string } {
  const subject = `New complaint — ${data.title} (${data.propertyName})`;
  const excerpt = data.description ? escapeHtml(data.description.slice(0, 300)) + (data.description.length > 300 ? "…" : "") : null;
  const html = shell(
    `New tenant complaint`,
    AMBER,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      A complaint was ${data.source === "PORTAL" ? "raised through the tenant portal" : "logged by on-site staff"} and is waiting to be acknowledged.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Complaint", escapeHtml(data.title))}
      ${row("Category", escapeHtml(data.categoryLabel))}
      ${row("Property", escapeHtml(data.propertyName))}
      ${row("Unit", data.unitRef ? escapeHtml(data.unitRef) : "—")}
      ${row("Tenant", data.tenantName ? escapeHtml(data.tenantName) : "Not linked")}
      ${row("Raised by", escapeHtml(data.raisedByName))}
    </table>
    ${excerpt ? `<p style="color:#111827;font-size:13px;line-height:1.6;background:#f9fafb;padding:10px 12px;border-radius:6px;white-space:pre-wrap;">${excerpt}</p>` : ""}
    ${cta("Open complaint", `${APP_URL}/complaints/${data.complaintId}`)}`,
  );
  return { subject, html };
}

export function complaintResolvedTemplate(data: {
  tenantName: string;
  title: string;
  propertyName: string;
  resolutionNote: string | null;
  portalUrl: string | null;
}): { subject: string; html: string } {
  const subject = `Your complaint has been resolved — ${data.title}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:${NAVY};font-size:20px;margin-bottom:6px;">Complaint resolved</h2>
      <p style="color:${GRAY};font-size:14px;line-height:1.6;">Hi ${escapeHtml(data.tenantName)},</p>
      <p style="color:${GRAY};font-size:14px;line-height:1.6;">
        Your complaint <strong>${escapeHtml(data.title)}</strong> at ${escapeHtml(data.propertyName)} has been marked as resolved.
      </p>
      ${data.resolutionNote ? `<p style="color:#111827;font-size:13px;line-height:1.6;background:#f9fafb;padding:10px 12px;border-radius:6px;white-space:pre-wrap;">${escapeHtml(data.resolutionNote)}</p>` : ""}
      <p style="color:${GRAY};font-size:14px;line-height:1.6;">If the issue is not sorted, reply through your tenant portal and we will look again.</p>
      ${data.portalUrl ? cta("Open tenant portal", data.portalUrl) : ""}
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
      <p style="color:${LGRAY};font-size:11px;margin:0;">Sent by your property manager via GroundWorkPM.</p>
    </div>`;
  return { subject, html };
}

// ─── Monthly owner statement ──────────────────────────────────────────────────

export function ownerMonthlyReportTemplate(data: {
  propertyName: string;
  periodLabel: string;       // e.g. "May 2026"
  grossIncome: string;       // pre-formatted currency strings
  commissions: string;
  operatingExpenses: string;
  netProfit: string;
  occupiedUnits: number;
  totalUnits: number;
  isFallbackToManager: boolean;
}): { subject: string; html: string } {
  const subject = `Monthly statement — ${data.propertyName} — ${data.periodLabel}`;

  const note = data.isFallbackToManager
    ? `<p style="color:${LGRAY};font-size:12px;margin-top:12px;">
        This statement was sent to you because no owner account is linked to this
        property. Link an owner under Properties to send it to them directly.
      </p>`
    : "";

  const html = shell(
    `${data.propertyName} — ${data.periodLabel}`,
    NAVY,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      Here is the monthly performance summary for <strong>${data.propertyName}</strong>.
      The full report with per-unit detail is available in the owner portal.
    </p>
    <table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Period", data.periodLabel)}
      ${row("Gross income", data.grossIncome)}
      ${row("Agent commissions", data.commissions)}
      ${row("Operating expenses", data.operatingExpenses)}
      ${row("Net profit", `<strong>${data.netProfit}</strong>`)}
      ${row("Occupancy", `${data.occupiedUnits} of ${data.totalUnits} units`)}
    </table>
    ${cta("View full report", `${APP_URL}/report`)}
    ${note}`,
  );

  return { subject, html };
}

// ─── Inspections ──────────────────────────────────────────────────────────────

const STAFF_FOOTER = "You receive these alerts because you work on this property on GroundWorkPM.";

type InspectionRef = {
  inspectionId: string;
  typeLabel: string;           // "Move-in"
  propertyName: string;
  unitRef: string;
  tenantName: string | null;
  scheduledFor: string | null; // already formatted
};

function inspectionRows(d: InspectionRef): string {
  return `<table style="border-collapse:collapse;margin-bottom:4px;">
      ${row("Inspection", `${escapeHtml(d.typeLabel)} inspection`)}
      ${row("Property", escapeHtml(d.propertyName))}
      ${row("Unit", escapeHtml(d.unitRef))}
      ${row("Tenant", d.tenantName ? escapeHtml(d.tenantName) : "—")}
      ${d.scheduledFor ? row("When", escapeHtml(d.scheduledFor)) : ""}
    </table>`;
}

function quote(text: string): string {
  return `<p style="color:#111827;font-size:13px;line-height:1.6;background:#f9fafb;padding:10px 12px;border-radius:6px;white-space:pre-wrap;">${escapeHtml(text.slice(0, 1500))}</p>`;
}

export function inspectionAssignedTemplate(d: InspectionRef & { assignedByName: string }): { subject: string; html: string } {
  const subject = `${d.typeLabel} inspection — Unit ${d.unitRef}, ${d.propertyName}`;
  const html = shell(
    "An inspection was assigned to you",
    NAVY,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      ${escapeHtml(d.assignedByName)} assigned you this inspection.
    </p>
    ${inspectionRows(d)}
    ${cta("Open inspection", `${APP_URL}/inspections/${d.inspectionId}`)}`,
    STAFF_FOOTER,
  );
  return { subject, html };
}

export function inspectionSubmittedTemplate(d: InspectionRef & {
  submittedByName: string;
  damaged: { room: string; feature: string; notes?: string }[];
  tenantIssues: string | null;
  tenantSignOff: "SIGNED" | "ABSENT" | "REFUSED" | null;
  tenantDisagrees: boolean;
  tenantComments: string | null;
  /** Mid-term or post-stay check that found damage — red, "Damage found" subject. */
  damageAlert: boolean;
}): { subject: string; html: string } {
  const where = `${d.typeLabel.toLowerCase()} inspection`;
  const subject = d.damageAlert
    ? `Damage found at ${where} — Unit ${d.unitRef}, ${d.propertyName}`
    : `${d.typeLabel} inspection ready for review — Unit ${d.unitRef}, ${d.propertyName}`;
  const signOff = d.tenantSignOff === "SIGNED" ? "Signed"
    : d.tenantSignOff === "ABSENT" ? "Tenant not present"
    : d.tenantSignOff === "REFUSED" ? "Tenant declined to sign" : "—";
  const damage = d.damaged.length
    ? `<p style="color:${RED};font-size:14px;font-weight:600;margin:16px 0 6px;">Damage recorded (${d.damaged.length})</p>
       <ul style="color:#111827;font-size:13px;line-height:1.6;padding-left:18px;margin:0;">
         ${d.damaged.slice(0, 15).map((i) => `<li>${escapeHtml(i.room)} — ${escapeHtml(i.feature)}${i.notes ? `: ${escapeHtml(i.notes)}` : ""}</li>`).join("")}
       </ul>`
    : "";
  const html = shell(
    d.damageAlert ? `Damage found at a ${where}` : "Inspection handed in",
    d.damageAlert ? RED : AMBER,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      ${escapeHtml(d.submittedByName)} handed in this inspection. Review it, then accept it or send it back.
    </p>
    ${inspectionRows(d)}
    ${d.tenantName ? `<table style="border-collapse:collapse;">${row("Tenant sign-off", signOff + (d.tenantDisagrees ? " · disagrees" : ""))}</table>` : ""}
    ${damage}
    ${d.tenantIssues ? `<p style="color:${AMBER};font-size:14px;font-weight:600;margin:16px 0 6px;">${d.tenantName ? "Issues the tenant raised" : "Issues reported"}</p>${quote(d.tenantIssues)}` : ""}
    ${d.tenantComments ? `<p style="color:${GRAY};font-size:14px;font-weight:600;margin:16px 0 6px;">Tenant's comments</p>${quote(d.tenantComments)}` : ""}
    ${cta("Review inspection", `${APP_URL}/inspections/${d.inspectionId}`)}`,
  );
  return { subject, html };
}

/** Caretaker-facing follow-ups: keys cleared, report sent back, correction decided. */
export function inspectionUpdateTemplate(d: InspectionRef & {
  kind: "keys_cleared" | "sent_back" | "edit_approved" | "edit_declined";
  byName: string;
  note: string | null;
}): { subject: string; html: string } {
  const copy = {
    keys_cleared: { title: "Keys can be handed over", line: "confirmed the deposit and first rent. You can hand the keys to the tenant and record them on the inspection.", color: "#16a34a" },
    sent_back: { title: "Inspection sent back to you", line: "sent this inspection back. Make the changes below and hand it in again.", color: AMBER },
    edit_approved: { title: "Correction approved", line: "approved your correction. The inspection is open for editing again.", color: NAVY },
    edit_declined: { title: "Correction declined", line: "declined your correction.", color: GRAY },
  }[d.kind];
  const subject = `${copy.title} — Unit ${d.unitRef}, ${d.propertyName}`;
  const html = shell(
    copy.title,
    copy.color,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">${escapeHtml(d.byName)} ${copy.line}</p>
    ${inspectionRows(d)}
    ${d.note ? quote(d.note) : ""}
    ${cta("Open inspection", `${APP_URL}/inspections/${d.inspectionId}`)}`,
    STAFF_FOOTER,
  );
  return { subject, html };
}

export function inspectionEditRequestedTemplate(d: InspectionRef & { requestedByName: string; reason: string }): { subject: string; html: string } {
  const subject = `Correction requested — ${d.typeLabel} inspection, Unit ${d.unitRef}`;
  const html = shell(
    "A correction was requested",
    AMBER,
    `<p style="color:${GRAY};font-size:14px;line-height:1.6;margin-bottom:16px;">
      ${escapeHtml(d.requestedByName)} wants to correct a handed-in inspection. Approve to reopen it, or decline.
    </p>
    ${inspectionRows(d)}
    ${quote(d.reason)}
    ${cta("Review request", `${APP_URL}/inspections/${d.inspectionId}`)}`,
  );
  return { subject, html };
}

/** The accepted report, sent to the tenant by a manager (PDF attached). */
export function inspectionReportToTenantTemplate(d: {
  tenantName: string;
  typeLabel: string;
  propertyName: string;
  unitRef: string;
  orgName: string;
  message: string | null;
}): { subject: string; html: string } {
  const subject = `Your ${d.typeLabel.toLowerCase()} condition report — Unit ${d.unitRef}, ${d.propertyName}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:${NAVY};font-size:20px;margin-bottom:6px;">Your condition report</h2>
      <p style="color:#111827;font-size:14px;line-height:1.6;">Dear ${escapeHtml(d.tenantName)},</p>
      <p style="color:#111827;font-size:14px;line-height:1.6;">
        Attached is the ${escapeHtml(d.typeLabel.toLowerCase())} condition report for Unit ${escapeHtml(d.unitRef)}, ${escapeHtml(d.propertyName)}, with the photos taken during the inspection.
      </p>
      ${d.message ? quote(d.message) : ""}
      <p style="color:#111827;font-size:14px;line-height:1.6;">If anything in it looks wrong, please reply to this email.</p>
      <p style="color:${GRAY};font-size:13px;margin-top:20px;">${escapeHtml(d.orgName)}</p>
    </div>`;
  return { subject, html };
}
