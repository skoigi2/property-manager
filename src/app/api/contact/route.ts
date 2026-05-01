import { NextResponse } from "next/server";
import { z } from "zod";
import { sendContactEmail } from "@/lib/email";

const schema = z.object({
  name:    z.string().min(1, "Name is required").max(100),
  email:   z.string().email("Invalid email address"),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(20, "Message must be at least 20 characters").max(5000),
});

// Basic spam guard — reject if message contains more than 3 URLs
const URL_RE = /https?:\/\//gi;
function isSpam(message: string): boolean {
  return (message.match(URL_RE) ?? []).length > 3;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { name, email, subject, message } = parsed.data;

    if (isSpam(message)) {
      return NextResponse.json({ error: "Message flagged as spam." }, { status: 400 });
    }

    // Fire-and-forget — matches existing email pattern in the codebase
    sendContactEmail(name, email, subject, message).catch((err) =>
      console.error("[contact] email send failed:", err),
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
