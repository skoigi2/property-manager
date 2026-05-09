import { Resend } from "resend";
import { prisma } from "./prisma";
import type { EmailKind } from "@prisma/client";

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
export function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeAddress(addr: string): string {
  if (/[\r\n]/.test(addr)) {
    throw new Error("Invalid email address");
  }
  return addr;
}

// ─── Send + log helper ────────────────────────────────────────────────────────
// Every outbound email goes through this so it lands in the EmailLog table.
// On Resend failure we still write a "failed" row, then re-throw.

interface SendAndLogArgs {
  kind: EmailKind;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  organizationId?: string | null;
  userId?: string | null;
  inReplyToId?: string | null;
}

export async function sendAndLog(args: SendAndLogArgs): Promise<{ id: string; resendId: string | null }> {
  const to = safeAddress(args.to);
  const replyTo = args.replyTo ? safeAddress(args.replyTo) : undefined;

  let resendId: string | null = null;
  let status = "sent";
  let errorMessage: string | null = null;
  let thrown: unknown = null;

  try {
    const res = await getResend().emails.send({
      from: FROM,
      to,
      subject: args.subject,
      html: args.html,
      ...(replyTo ? { replyTo } : {}),
    });
    resendId = (res as any)?.data?.id ?? (res as any)?.id ?? null;
    if ((res as any)?.error) {
      status = "failed";
      errorMessage = String((res as any).error?.message ?? (res as any).error);
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    thrown = err;
  }

  let logId = "";
  try {
    const log = await prisma.emailLog.create({
      data: {
        kind: args.kind,
        fromEmail: FROM,
        toEmail: to,
        replyTo: replyTo ?? null,
        subject: args.subject,
        bodyHtml: args.html,
        resendId,
        status,
        errorMessage,
        organizationId: args.organizationId ?? null,
        userId: args.userId ?? null,
        inReplyToId: args.inReplyToId ?? null,
      },
      select: { id: true },
    });
    logId = log.id;
  } catch (logErr) {
    // Logging failure must never mask a real send error.
    console.error("EmailLog write failed:", logErr);
  }

  if (thrown) throw thrown;
  return { id: logId, resendId };
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string, resetLink: string, userId?: string): Promise<void> {
  await sendAndLog({
    kind: "PASSWORD_RESET",
    to: email,
    userId: userId ?? null,
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
  meta?: { organizationId?: string | null; userId?: string | null },
): Promise<void> {
  await sendAndLog({
    kind: "NOTIFICATION",
    to,
    subject,
    html,
    organizationId: meta?.organizationId ?? null,
    userId: meta?.userId ?? null,
  });
}

// ─── Organisation invitation ─────────────────────────────────────────────────

export async function sendOrgInvitation(
  email: string,
  inviterName: string,
  orgName: string,
  role: string,
  acceptUrl: string,
  expiresAt: Date,
  meta?: { organizationId?: string | null; userId?: string | null },
): Promise<void> {
  const expiryStr = expiresAt.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();

  await sendAndLog({
    kind: "ORG_INVITATION",
    to: email,
    organizationId: meta?.organizationId ?? null,
    userId: meta?.userId ?? null,
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
  await sendAndLog({
    kind: "CONTACT_FORM",
    to: "support@groundworkpm.com",
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
  await sendAndLog({
    kind: "CONTACT_AUTOREPLY",
    to: safeEmail,
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

export async function sendNewUserAlert(
  userEmail: string,
  userName: string,
  orgName: string,
  meta?: { organizationId?: string | null; userId?: string | null },
): Promise<void> {
  const ts = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  await sendAndLog({
    kind: "NEW_USER_ALERT",
    to: "support@groundworkpm.com",
    organizationId: meta?.organizationId ?? null,
    userId: meta?.userId ?? null,
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

export async function sendWelcome(email: string, name: string, userId?: string): Promise<void> {
  await sendAndLog({
    kind: "WELCOME",
    to: email,
    userId: userId ?? null,
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
