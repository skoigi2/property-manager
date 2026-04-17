const APP_URL = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";

const NAVY  = "#132635";
const GOLD  = "#c9a84c";
const GRAY  = "#6b7280";
const LGRAY = "#9ca3af";
const RED   = "#dc2626";
const AMBER = "#d97706";

function shell(heading: string, headingColor: string, body: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:${headingColor};font-size:20px;margin-bottom:6px;">${heading}</h2>
      ${body}
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
      <p style="color:${LGRAY};font-size:11px;margin:0;">
        You receive these alerts because you manage this property on GroundWorkPM.
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

// ─── Urgent maintenance stale ────────────────────────────────────────────────

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
