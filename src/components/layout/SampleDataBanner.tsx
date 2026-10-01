"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { RefreshCw, X } from "lucide-react";
import { useProperty, type PropertyOption } from "@/lib/property-context";
import { isSampleStale, refreshDismissKey } from "@/lib/demo-refresh";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * A sample property's data stops at the month it was loaded in, so a month
 * later every tenant reads as unpaid and the meters as unread. Offer admins
 * and managers a one-click refresh (POST /api/demo/refresh — same property id,
 * today's dates). "Not now" hides it until next month.
 */
export function SampleDataBanner() {
  const { data: session } = useSession();
  const { properties, selectedId } = useProperty();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<{ property: PropertyOption; addedText: string | null } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const user = session?.user;
  const isSuperAdmin = user?.role === "ADMIN" && !user?.organizationId;
  const canRefresh = !!user && (isSuperAdmin || user.orgRole === "ADMIN" || user.orgRole === "MANAGER");

  useEffect(() => {
    const ids = new Set<string>();
    for (const p of properties) {
      try {
        if (localStorage.getItem(refreshDismissKey(p.id))) ids.add(p.id);
      } catch {
        // storage blocked — the banner just shows
      }
    }
    setDismissed(ids);
  }, [properties]);

  if (!canRefresh) return null;
  // The selected property, or every sample in the "All properties" view
  // (a super-admin sees every org's samples, so only the selected one).
  const inScope = selectedId ? properties.filter((p) => p.id === selectedId) : isSuperAdmin ? [] : properties;
  const stale = inScope.filter((p) => p.isDemo && p.seededAt && isSampleStale(p.seededAt) && !dismissed.has(p.id));
  if (stale.length === 0 && !confirming) return null;

  function dismiss(id: string) {
    try {
      localStorage.setItem(refreshDismissKey(id), "1");
    } catch {
      // storage blocked — hide for this page view only
    }
    setDismissed((prev) => new Set(prev).add(id));
  }

  async function ask(property: PropertyOption) {
    setChecking(property.id);
    try {
      const res = await fetch(`/api/demo/refresh?propertyId=${encodeURIComponent(property.id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't check the sample property");
      setConfirming({ property, addedText: data.addedText ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't check the sample property");
    } finally {
      setChecking(null);
    }
  }

  async function refresh() {
    if (!confirming) return;
    setRefreshing(true);
    const toastId = toast.loading(`Refreshing ${confirming.property.name}… this can take a minute`);
    try {
      const res = await fetch("/api/demo/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: confirming.property.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Refreshing the sample failed");
      toast.success(`${confirming.property.name} is up to date`, { id: toastId });
      // Same property id — reload so every page re-reads the new data.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refreshing the sample failed", { id: toastId });
      setRefreshing(false);
      setConfirming(null);
    }
  }

  const loadedOn = (p: PropertyOption) =>
    new Date(p.seededAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const name = confirming?.property.name ?? "sample";
  const message =
    `${name} is loaded again with today's dates. ` +
    (confirming?.addedText
      ? `Everything in it is replaced, including what you've added since it was loaded (${confirming.addedText}).`
      : "Everything in it is replaced with fresh sample data.");

  return (
    <>
      <div className="space-y-px">
        {stale.map((p) => (
          <div
            key={p.id}
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 text-body"
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <RefreshCw size={15} className="shrink-0 mt-0.5 sm:mt-0 opacity-70" />
              <span>
                <span className="font-medium">{p.name}</span> is sample data loaded on {loadedOn(p)}, so the months since
                show as unpaid.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => ask(p)}
                disabled={checking === p.id || refreshing}
                className="bg-amber-600 text-white font-semibold px-4 py-1.5 rounded-lg text-caption hover:bg-amber-700 transition-colors disabled:opacity-60"
              >
                {checking === p.id ? "Checking…" : "Refresh sample data"}
              </button>
              <button
                onClick={() => dismiss(p.id)}
                aria-label="Not now"
                title="Not now"
                className="p-1 rounded hover:bg-amber-100"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirming}
        onClose={() => !refreshing && setConfirming(null)}
        onConfirm={refresh}
        loading={refreshing}
        title={`Refresh ${name}?`}
        message={message}
        confirmLabel="Refresh"
      />
    </>
  );
}
