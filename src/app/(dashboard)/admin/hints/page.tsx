"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { Select } from "@/components/ui/Select";

interface Hint {
  id: string;
  hintType: string;
  refId: string;
  severity: "URGENT" | "WARNING" | "INFO";
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  property: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
}

const SEVERITY_BADGE: Record<Hint["severity"], "red" | "amber" | "blue"> = {
  URGENT: "red", WARNING: "amber", INFO: "blue",
};

export default function AdminHintsPage() {
  const [hints, setHints] = useState<Hint[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");

  useEffect(() => {
    const url = statusFilter === "ALL"
      ? "/api/hints?includeAllStatuses=true"
      : "/api/hints?includeAllStatuses=true";
    fetch(url)
      .then((r) => r.json())
      .then((d: Hint[]) => {
        const filtered = statusFilter === "ALL" ? d : d.filter((h) => h.status === statusFilter);
        setHints(filtered);
      })
      .catch(() => setHints([]));
  }, [statusFilter]);

  return (
    <>
      <Header title="Hints (debug)" />
      <div className="page-container space-y-4">
        <Select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "ALL", label: "All" },
            { value: "ACTIVE", label: "Active" },
            { value: "ACTED_ON", label: "Acted on" },
            { value: "DISMISSED", label: "Dismissed" },
            { value: "EXPIRED", label: "Expired" },
          ]}
        />
        {hints === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : hints.length === 0 ? (
          <p className="text-sm text-gray-500">No hints.</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl border border-gray-100">
            <table className="min-w-[900px] w-full text-sm font-sans">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Sev</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Property / Org</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hints.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs font-mono">{h.hintType}</td>
                    <td className="px-3 py-2"><Badge variant={SEVERITY_BADGE[h.severity]}>{h.severity}</Badge></td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{h.title}</p>
                      <p className="text-xs text-gray-500">{h.subtitle}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {h.property?.name ?? "—"}<br />
                      <span className="text-gray-400">{h.organization?.name ?? ""}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{h.status}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{new Date(h.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
