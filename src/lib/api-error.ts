/**
 * Turn an API failure into something a person can act on.
 *
 * A 400 from zod arrives as `{ error: { fieldErrors, formErrors } }`; 402
 * (subscription lock), 403 (permission) and our own scope checks arrive as a
 * string; an unhandled server exception arrives as a 500 with an empty body.
 * Pages should surface this instead of a fixed "Failed to save" toast so the
 * user (and support) can tell a locked subscription from a bad field from a
 * server fault.
 */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const err = data?.error;
  if (typeof err === "string" && err.trim()) return err;
  if (res.status === 402) return "Your subscription is locked. Billing needs attention before you can make changes.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (err && typeof err === "object") {
    const fe = (err.fieldErrors ?? {}) as Record<string, string[]>;
    const first = Object.entries(fe).find(([, v]) => Array.isArray(v) && v.length > 0);
    if (first) return `${first[0]}: ${first[1][0]}`;
    if (Array.isArray(err.formErrors) && err.formErrors.length > 0) return err.formErrors[0];
  }
  if (res.status >= 500) return `${fallback} (server error ${res.status}). Please try again; if it persists, contact support.`;
  return fallback;
}
