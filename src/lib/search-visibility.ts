/**
 * Which global-search groups a role may query. Pure (unit-tested).
 *
 * CARETAKER gets only the groups whose pages they can open: properties (as a
 * scope hint), vendors (already the trimmed select), maintenance, expenses and
 * complaints. Tenants, invoices, cases and tenant documents are never queried
 * for the role — not fetched-then-filtered — and complaint hits exclude the
 * categories the role cannot see (STAFF_CONDUCT, see complaint-rules.ts).
 */

export type SearchGroup = "tenant" | "property" | "invoice" | "vendor" | "case" | "maintenance" | "expense" | "document" | "complaint";

export const ALL_SEARCH_GROUPS: readonly SearchGroup[] = [
  "tenant", "property", "invoice", "vendor", "case", "maintenance", "expense", "document", "complaint",
];

const CARETAKER_GROUPS: readonly SearchGroup[] = ["property", "vendor", "maintenance", "expense", "complaint"];

export function searchGroupsFor(orgRole: string | null | undefined): readonly SearchGroup[] {
  return orgRole === "CARETAKER" ? CARETAKER_GROUPS : ALL_SEARCH_GROUPS;
}

/** Deep-link targets differ by role: a caretaker cannot open /cases or /properties. */
export function searchHrefs(orgRole: string | null | undefined) {
  const caretaker = orgRole === "CARETAKER";
  return {
    property: () => (caretaker ? "/maintenance" : "/properties"),
    maintenance: (jobId: string, caseThreadId: string | null) =>
      caretaker || !caseThreadId ? `/maintenance?focus=${jobId}` : `/cases/${caseThreadId}`,
  };
}
