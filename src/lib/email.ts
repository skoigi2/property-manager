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

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string, resetLink: string): Promise<void> {
  await getResend().emails.send({
    from:    FROM,
    to:      email,
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
  await getResend().emails.send({ from: FROM, to, subject, html });
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
    to:      email,
    subject: `You've been invited to join ${orgName} on Groundwork PM`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">You're invited to join ${orgName}</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong>
          on Groundwork PM as a <strong>${roleLabel}</strong>.
        </p>
        <a href="${acceptUrl}"
           style="display: inline-block; margin: 24px 0; background: #1a1a2e; color: white;
                  padding: 12px 28px; border-radius: 8px; text-decoration: none;
                  font-size: 14px; font-weight: 600;">
          Accept invitation →
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
          This invitation expires on ${expiryStr}.
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

// ─── Welcome email ────────────────────────────────────────────────────────────

export async function sendWelcome(email: string, name: string): Promise<void> {
  await getResend().emails.send({
    from:    FROM,
    to:      email,
    subject: "Welcome to Groundwork PM 🏠",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">Welcome, ${name}!</h2>
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
