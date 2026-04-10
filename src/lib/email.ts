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

const FROM = process.env.RESEND_FROM_EMAIL ?? "Property Manager <noreply@propertymanager.app>";

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string, resetLink: string): Promise<void> {
  await getResend().emails.send({
    from:    FROM,
    to:      email,
    subject: "Reset your Property Manager password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          We received a request to reset the password for your Property Manager account.
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
        <p style="color: #9ca3af; font-size: 11px;">Property Manager · Smart property management for landlords &amp; agencies worldwide</p>
      </div>
    `,
  });
}

// ─── Welcome email ────────────────────────────────────────────────────────────

export async function sendWelcome(email: string, name: string): Promise<void> {
  await getResend().emails.send({
    from:    FROM,
    to:      email,
    subject: "Welcome to Property Manager 🏠",
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
        <a href="${process.env.NEXTAUTH_URL ?? "https://property-manager-ke-rho.vercel.app"}/onboarding"
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
