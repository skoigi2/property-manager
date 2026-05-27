import { differenceInSeconds, format } from "date-fns";
import { formatDate } from "@/lib/date-utils";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export function formatRelative(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const seconds = differenceInSeconds(new Date(), date);

  if (seconds < 0) return formatDate(date);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds <= SEVEN_DAYS) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
}

export function formatFull(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return format(date, "d MMM yyyy, h:mm a");
}

export function formatRelativeWithTooltip(input: Date | string): { short: string; full: string } {
  return { short: formatRelative(input), full: formatFull(input) };
}
