import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatRelativeWithTooltip } from "@/lib/relative-time";
import { CaseRow, ProgressChip, STATUS_BADGE, STATUS_LABEL, WAITING_LABEL } from "./shared";

export function CaseListView({ rows }: { rows: CaseRow[] }) {
  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
        {rows.map((c) => {
          const t = formatRelativeWithTooltip(c.lastActivityAt);
          return (
            <Link key={c.id} href={`/cases/${c.id}`} className="block p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className=" font-medium text-body truncate">{c.title}</p>
                <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
              </div>
              <p className="text-caption text-gray-500 ">
                {c.property.name}{c.unit ? ` · ${c.unit.unitNumber}` : ""}
              </p>
              <div className="mt-2">
                <ProgressChip c={c} />
              </div>
              <div className="flex items-center justify-between mt-2 text-caption ">
                <span className="text-gray-500">Waiting: {WAITING_LABEL[c.waitingOn]}</span>
                <span className="text-gray-400" title={t.full}>{t.short}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100">
        <table className="min-w-[800px] w-full text-body ">
          <thead className="bg-gray-50 text-left text-label uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Property / unit</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Progress</th>
              <th className="px-4 py-2">Waiting on</th>
              <th className="px-4 py-2">Assigned</th>
              <th className="px-4 py-2">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((c) => {
              const t = formatRelativeWithTooltip(c.lastActivityAt);
              return (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-2">
                    <Link href={`/cases/${c.id}`} className="text-gray-900 hover:text-gold">{c.title}</Link>
                    {c.caseType !== "MAINTENANCE" && (
                      <span className="ml-2 text-label uppercase text-gray-400">{c.caseType}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {c.property.name}{c.unit ? ` · ${c.unit.unitNumber}` : ""}
                  </td>
                  <td className="px-4 py-2"><Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge></td>
                  <td className="px-4 py-2"><ProgressChip c={c} /></td>
                  <td className="px-4 py-2 text-gray-600">{WAITING_LABEL[c.waitingOn]}</td>
                  <td className="px-4 py-2 text-gray-600">{c.assignedTo?.name ?? c.assignedTo?.email ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-400" title={t.full}>{t.short}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
