import crypto from "crypto";

/**
 * One-way hash for single-use security tokens (password reset, etc.).
 * Only the hash is persisted — a DB leak cannot be replayed as a live token.
 * The raw token goes to the user (email link); lookups hash the incoming
 * value and compare against the stored digest.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Generates a cryptographically random raw token (hex, 64 chars). */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
