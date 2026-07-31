import { CaseRow, CaseCard, CaseStatus, STATUS_LABEL, STATUS_ORDER } from "./shared";

export function CaseKanbanView({ rows }: { rows: CaseRow[] }) {
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    cases: rows.filter((c) => c.status === status),
  }));

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
      {byStatus.map(({ status, cases }) => (
        <div key={status} className="shrink-0 w-72">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-label font-semibold uppercase text-gray-500 ">
              {STATUS_LABEL[status as CaseStatus]}
            </span>
            <span className="text-caption font-mono text-gray-400">{cases.length}</span>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 space-y-2 min-h-[5rem]">
            {cases.length === 0 ? (
              <p className="text-caption text-gray-300 text-center py-6">No cases</p>
            ) : (
              cases.map((c) => <CaseCard key={c.id} c={c} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
