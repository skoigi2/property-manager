import { Resend } from "resend";

// ─── Lazy Resend singleton ────────────────────────────────────────────────────
// Initialized on first use so builds succeed even when RESEND_API_KEY is absent.

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!);
  }
  return _resend;
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "Groundwork PM <noreply@groundworkpm.com>";

// ─── HTML escaping ────────────────────────────────────────────────────────────
// Any user-supplied string interpolated into an email's HTML body MUST go
// through this — otherwise an attacker can inject arbitrary HTML/JS into the
// email rendered by the recipient's mail client.
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Reject CRLF in any user-supplied address used as a header value (To, Reply-To).
// `z.string().email()` does not catch this. Throws so the caller surfaces it as a 400.
function safeAddress(addr: string): string {
  if (/[\r\n]/.test(addr)) {
    throw new Error("Invalid email address");
  }
  return addr;
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string, resetLink: string): Promise<void> {
  await getResend().emails.send({
    from:    FROM,
    to:      safeAddress(email),
    subject: "Reset your Groundwork PM password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          We received a request to reset the password for your Groundwork PM account.
          Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetLink}"
           style="display: inline-block; margin: 24px 0; background: #1a1a2e; color: white;
                  padding: 12px 28px; border-radius: 8px; text-decoration: none;
                  font-size: 14px; font-weight: 600;">
          Reset password
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          If you didn't request a password reset, you can safely ignore this email.
          Your password won't change until you click the link above.
        </p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 11px;">Groundwork PM · Smart property management for landlords &amp; agencies worldwide</p>
      </div>
    `,
  });
}

// ─── Generic notification helper ─────────────────────────────────────────────

export async function sendNotificationEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await getResend().emails.send({ from: FROM, to: safeAddress(to), subject, html });
}

// ─── Organisation invitation ─────────────────────────────────────────────────

export async function sendOrgInvitation(
  email: string,
  inviterName: string,
  orgName: string,
  role: string,
  acceptUrl: string,
  expiresAt: Date,
): Promise<void> {
  const expiryStr = expiresAt.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();

  await getResend().emails.send({
    from:    FROM,
    to:      safeAddress(email),
    subject: `You've been invited to join ${orgName} on Groundwork PM`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">You're invited to join ${esc(orgName)}</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <strong>${esc(inviterName)}</strong> has invited you to join <strong>${esc(orgName)}</strong>
          on Groundwork PM as a <strong>${esc(roleLabel)}</strong>.
        </p>
        <a href="${esc(acceptUrl)}"
           style="display: inline-block; margin: 24px 0; background: #1a1a2e; color: white;
                  padding: 12px 28px; border-radius: 8px; text-decoration: none;
                  font-size: 14px; font-weight: 600;">
          Accept invitation →
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
          This invitation expires on ${esc(expiryStr)}.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
          If you don't have a Groundwork PM account yet, you'll be prompted to create one after clicking the link above.
        </p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 11px;">Groundwork PM · Smart property management for landlords &amp; agencies worldwide</p>
      </div>
    `,
  });
}

// ─── Contact form ─────────────────────────────────────────────────────────────

export async function sendContactEmail(
  name: string,
  email: string,
  subject: string,
  message: string,
): Promise<void> {
  const ts = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  const safeEmail = safeAddress(email);

  // 1. Notify support inbox
  await getResend().emails.send({
    from:    FROM,
    to:      "support@groundworkpm.com",
    replyTo: safeEmail,
    subject: `[Contact] ${subject.replace(/[\r\n]/g, " ")} — from ${name.replace(/[\r\n]/g, " ")}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 20px; margin-bottom: 4px;">New contact form submission</h2>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 0;">${esc(ts)}</p>
        <table style="width:100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color:#6b7280; width:90px;">Name</td><td style="color:#1a1a2e; font-weight:600;">${esc(name)}</td></tr>
          <tr><td style="padding: 8px 0; color:#6b7280;">Email</td><td><a href="mailto:${encodeURIComponent(safeEmail)}" style="color:#c9a84c;">${esc(safeEmail)}</a></td></tr>
          <tr><td style="padding: 8px 0; color:#6b7280;">Subject</td><td style="color:#1a1a2e;">${esc(subject)}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 16px 0;" />
        <p style="color: #374151; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${esc(message)}</p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 11px;">Groundwork PM · Contact form</p>
      </div>
    `,
  });

  // 2. Auto-reply to visitor
  await getResend().emails.send({
    from:    FROM,
    to:      safeEmail,
    subject: "We received your message — Groundwork PM",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">Thanks for reaching out, ${esc(name)}!</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          We've received your message and will reply within <strong>1 business day</strong>.
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          In the meantime, you can explore Groundwork PM with a free 30-day trial — no credit card required.
        </p>
        <a href="${esc(process.env.NEXTAUTH_URL ?? "https://groundworkpm.com")}/signup"
           style="display: inline-block; margin: 24px 0; background: #c9a84c; color: white;
                  padding: 12px 28px; border-radius: 8px; text-decoration: none;
                  font-size: 14px; font-weight: 600;">
          Start free trial →
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
          If your message is urgent, you can also reply directly to this email.
        </p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 11px;">Groundwork PM · Smart property management for landlords &amp; agencies worldwide</p>
      </div>
    `,
  });
}

// ─── New user signup alert (internal) ────────────────────────────────────────

export async function sendNewUserAlert(userEmail: string, userName: string, orgName: string): Promise<void> {
  const ts = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  await getResend().emails.send({
    from:    FROM,
    to:      "support@groundworkpm.com",
    subject: `New signup: ${userName.replace(/[\r\n]/g, " ")} (${orgName.replace(/[\r\n]/g, " ")})`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 20px; margin-bottom: 4px;">New user signed up</h2>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 0;">${esc(ts)}</p>
        <table style="width:100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color:#6b7280; width:120px;">Name</td><td style="color:#1a1a2e; font-weight:600;">${esc(userName)}</td></tr>
          <tr><td style="padding: 8px 0; color:#6b7280;">Email</td><td><a href="mailto:${encodeURIComponent(safeAddress(userEmail))}" style="color:#c9a84c;">${esc(userEmail)}</a></td></tr>
          <tr><td style="padding: 8px 0; color:#6b7280;">Organisation</td><td style="color:#1a1a2e;">${esc(orgName)}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 11px;">Groundwork PM · Internal signup notification</p>
      </div>
    `,
  });
}

// ─── Welcome email ────────────────────────────────────────────────────────────

export async function sendWelcome(email: string, name: string): Promise<void> {
  await getResend().emails.send({
    from:    FROM,
    to:      safeAddress(email),
    subject: "Welcome to Groundwork PM 🏠",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">Welcome, ${esc(name)}!</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          Your 30-day free trial has started. Here's what you can do:
        </p>
        <ul style="color: #6b7280; font-size: 14px; line-height: 2;">
          <li>Add your properties and units</li>
          <li>Record income and track rent payments</li>
          <li>Generate owner reports and invoices</li>
          <li>Manage maintenance and assets</li>
        </ul>
        <a href="${process.env.NEXTAUTH_URL ?? "https://groundworkpm.com"}/onboarding"
           style="display: inline-block; margin: 24px 0; background: #c9a84c; color: white;
                  padding: 12px 28px; border-radius: 8px; text-decoration: none;
                  font-size: 14px; font-weight: 600;">
          Set up your first property →
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          Questions? Reply to this email and we'll be happy to help.
        </p>
      </div>
    `,
  });
}
