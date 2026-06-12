import { Prisma } from "@prisma/client";

/** Round to 2 decimal places — use at every money write boundary. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert a Prisma Decimal (or passthrough number) to a plain number. */
export function toNumber(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/**
 * Deep-converts every Prisma Decimal in a query result to a plain number.
 * 2-dp currency values are exactly representable as doubles, so this is
 * lossless for our numeric(14,2) columns. Dates and other class instances
 * pass through untouched; only plain objects/arrays are walked.
 */
export function decimalsToNumbers<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number(value) as unknown as T;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decimalsToNumbers(value[i]);
    return value;
  }
  if (typeof value === "object") {
    if (value instanceof Date) return value;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value; // class instance — leave alone
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) obj[key] = decimalsToNumbers(obj[key]);
    return value;
  }
  return value;
}
