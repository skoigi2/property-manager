import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAndLog, esc } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { generateCalculatorReportPdf } from "@/lib/calculator-report-pdf";
import { compareStrategies, type CalculatorInputs } from "@/lib/rental-calculator";
import { formatCurrency, SUPPORTED_CURRENCIES } from "@/lib/currency";

export const maxDuration = 30; // PDF render can be slow on cold starts

const money = z.number().min(0).max(100_000_000);
const pct = z.number().min(0).max(100);

const schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  email: z.string().trim().email("Invalid email address").max(200),
  inputs: z.object({
    currency: z.string().refine((c) => SUPPORTED_CURRENCIES.some((s) => s.code === c), "Unsupported currency"),
    hasslePremiumMonthly: money,
    longTerm: z.object({
      monthlyRent: money,
      vacancyRatePct: pct,
      managementFeePct: pct,
      annualPropertyTaxes: money,
      annualInsurance: money,
      annualRepairs: money,
      annualCapexReserve: money,
      annualHoaFees: money,
      annualOtherExpenses: money,
    }),
    airbnb: z.object({
      nightlyRate: money,
      occupancyRatePct: pct,
      avgStayNights: z.number().min(0).max(365),
      cleaningCostPerTurnover: money,
      monthlyUtilities: money,
      monthlyInternet: money,
      monthlySupplies: money,
      platformFeePct: pct,
      lodgingTaxPct: pct,
      managementFeePct: pct,
      annualPropertyTaxes: money,
      annualInsurance: money,
      annualRepairs: money,
      annualFurnishingReserve: money,
      annualHoaFees: money,
      annualOtherExpenses: money,
    }),
  }),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = rateLimit(`calc-report:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many report requests — please try again in an hour." },
      { status: 429 }
    );
  }

  let parsed: z.infer<typeof schema>;
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { firstName, email } = parsed;
  const inputs = parsed.inputs as CalculatorInputs;

  try {
    // Recompute everything server-side from the raw assumptions — the client
    // never sends derived numbers, so the report can't be tampered with.
    const r = compareStrategies(inputs);
    const fmt = (n: number) => formatCurrency(Math.round(n), inputs.currency);
    const pdf = await generateCalculatorReportPdf(firstName, inputs);
    const be = r.breakevenOccupancyPct;

    await sendAndLog({
      kind: "NOTIFICATION",
      to: email,
      subject: "Your Airbnb vs Long-Term Rental investor report — GroundWorkPM",
      attachments: [{ filename: "airbnb-vs-long-term-rental-report.pdf", content: pdf }],
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a2e; font-size: 22px; margin-bottom: 8px;">Your investor report is attached, ${esc(firstName)}</h2>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Thanks for running the numbers. Here's the headline from your analysis:
          </p>
          <table style="width:100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
            <tr><td style="padding: 8px 0; color:#6b7280;">Long-term monthly NOI</td><td style="color:#1a1a2e; font-weight:600; text-align:right;">${esc(fmt(r.longTerm.monthlyNoi))}</td></tr>
            <tr><td style="padding: 8px 0; color:#6b7280;">Airbnb monthly NOI</td><td style="color:#1a1a2e; font-weight:600; text-align:right;">${esc(fmt(r.airbnb.monthlyNoi))}</td></tr>
            <tr><td style="padding: 8px 0; color:#6b7280;">Breakeven occupancy</td><td style="color:#c9a84c; font-weight:700; text-align:right;">${be === null ? "Not reachable" : `${be.toFixed(1)}%`}</td></tr>
          </table>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            The attached PDF includes the full side-by-side analysis, 10-year comparison, stress tests, and our
            hassle-adjusted recommendation — feel free to share it with a spouse, partner, or lender.
          </p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            When you're ready to run your property like a business, GroundWorkPM tracks every payment, expense, and
            maintenance job for long-term and short-let portfolios alike.
          </p>
          <a href="https://groundworkpm.com/signup"
             style="display: inline-block; margin: 20px 0; background: #c9a84c; color: white;
                    padding: 12px 28px; border-radius: 8px; text-decoration: none;
                    font-size: 14px; font-weight: 600;">
            Start free — no credit card →
          </a>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 11px; line-height: 1.6;">
            This report provides estimates only and should not replace professional financial, tax, or legal advice.
            We'll occasionally send practical property investment insights — you can unsubscribe anytime.<br/>
            Groundwork PM · Smart property management for landlords &amp; agencies worldwide
          </p>
        </div>
      `,
    });

    // Internal lead alert — fire-and-forget so a failure never blocks the user.
    sendAndLog({
      kind: "NOTIFICATION",
      to: "support@groundworkpm.com",
      replyTo: email,
      subject: `[Lead] Calculator report — ${firstName.replace(/[\r\n]/g, " ")} <${email.replace(/[\r\n]/g, " ")}>`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a2e; font-size: 18px;">New calculator lead</h2>
          <table style="width:100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
            <tr><td style="padding: 6px 0; color:#6b7280; width:180px;">Name</td><td style="color:#1a1a2e; font-weight:600;">${esc(firstName)}</td></tr>
            <tr><td style="padding: 6px 0; color:#6b7280;">Email</td><td style="color:#1a1a2e;">${esc(email)}</td></tr>
            <tr><td style="padding: 6px 0; color:#6b7280;">Currency</td><td style="color:#1a1a2e;">${esc(inputs.currency)}</td></tr>
            <tr><td style="padding: 6px 0; color:#6b7280;">LT monthly NOI</td><td style="color:#1a1a2e;">${esc(fmt(r.longTerm.monthlyNoi))}</td></tr>
            <tr><td style="padding: 6px 0; color:#6b7280;">Airbnb monthly NOI</td><td style="color:#1a1a2e;">${esc(fmt(r.airbnb.monthlyNoi))}</td></tr>
            <tr><td style="padding: 6px 0; color:#6b7280;">Breakeven occupancy</td><td style="color:#1a1a2e;">${be === null ? "N/A" : `${be.toFixed(1)}%`}</td></tr>
            <tr><td style="padding: 6px 0; color:#6b7280;">Verdict</td><td style="color:#1a1a2e;">${esc(r.verdict)}</td></tr>
          </table>
          <p style="color: #9ca3af; font-size: 11px;">Groundwork PM · Airbnb vs LTR calculator lead capture</p>
        </div>
      `,
    }).catch((err) => console.error("[calculator-report] lead alert failed:", err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[calculator-report] failed:", err);
    return NextResponse.json(
      { error: "We couldn't send your report right now. Please try again shortly." },
      { status: 500 }
    );
  }
}
