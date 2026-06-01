"use client";
import { Fragment, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Check, Zap, LayoutGrid, List, ChevronDown, Building2 } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

type Category = "WORKFLOW" | "NOTIFICATION" | "REMINDER";
type ViewMode = "grid" | "table";
type OverrideState = "inherit" | "on" | "off";

interface Automation {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  actions: string[];
  category: Category;
  /** propertyId → enabled. Absence = inherit org-level `enabled`. */
  overrides: Record<string, boolean>;
}

interface PropertyLite {
  id: string;
  name: string;
}

const SECTIONS: { category: Category; heading: string; blurb: string }[] = [
  {
    category: "WORKFLOW",
    heading: "Workflow automations",
    blurb: "Automatically open a tracked Case when the condition is met, notify managers and surface it in your Inbox. Off by default — turn on the ones you want.",
  },
  {
    category: "NOTIFICATION",
    heading: "Email notifications",
    blurb: "Email managers (and raise an Inbox item) when something needs attention. Turn one off to stop those emails.",
  },
  {
    category: "REMINDER",
    heading: "Smart reminders",
    blurb: "Surface proactive nudges in your Inbox — no emails. Turn one off to hide that reminder.",
  },
];

const VIEW_KEY = "automations-view";

function Toggle({ enabled, label, saving, onToggle }: { enabled: boolean; label: string; saving: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={saving}
      onClick={onToggle}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        enabled ? "bg-gold" : "bg-gray-300",
        saving && "opacity-60"
      )}
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// Three-state segmented control: Inherit / On / Off for one property.
function OverrideControl({
  state,
  saving,
  onChange,
}: {
  state: OverrideState;
  saving: boolean;
  onChange: (s: OverrideState) => void;
}) {
  const opts: { value: OverrideState; label: string }[] = [
    { value: "inherit", label: "Inherit" },
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
  ];
  return (
    <div className={clsx("inline-flex rounded-md border border-gray-200 overflow-hidden", saving && "opacity-60")}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={saving}
          onClick={() => onChange(o.value)}
          className={clsx(
            "px-2.5 py-1 text-xs font-sans transition-colors",
            state === o.value
              ? o.value === "on"
                ? "bg-income/10 text-income"
                : o.value === "off"
                ? "bg-expense/10 text-expense"
                : "bg-gray-100 text-gray-700"
              : "bg-white text-gray-400 hover:text-gray-700"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AutomationsPage() {
  const { data: session } = useSession();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(VIEW_KEY) : null;
    if (stored === "table" || stored === "grid") setView(stored);
  }, []);

  useEffect(() => {
    fetch("/api/automations")
      .then((r) => r.json())
      .then((d) => {
        setAutomations(d.automations ?? []);
        setProperties(d.properties ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  function setViewMode(v: ViewMode) {
    setView(v);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, v);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggle(a: Automation) {
    const next = !a.enabled;
    setSaving(a.id);
    setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: next } : x)));
    try {
      const res = await fetch(`/api/automations/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${a.name} ${next ? "enabled" : "disabled"}`);
    } catch {
      setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: a.enabled } : x)));
      toast.error("Could not update automation");
    } finally {
      setSaving(null);
    }
  }

  async function setOverride(a: Automation, propertyId: string, stateNext: OverrideState) {
    const enabled = stateNext === "inherit" ? null : stateNext === "on";
    const savingKey = `${a.id}:${propertyId}`;
    setSaving(savingKey);

    // Optimistic
    const prevOverrides = a.overrides;
    setAutomations((prev) =>
      prev.map((x) => {
        if (x.id !== a.id) return x;
        const ov = { ...x.overrides };
        if (enabled === null) delete ov[propertyId];
        else ov[propertyId] = enabled;
        return { ...x, overrides: ov };
      })
    );

    try {
      const res = await fetch(`/api/automations/${a.id}/overrides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...x, overrides: prevOverrides } : x)));
      toast.error("Could not update property override");
    } finally {
      setSaving(null);
    }
  }

  function overrideState(a: Automation, propertyId: string): OverrideState {
    if (!(propertyId in a.overrides)) return "inherit";
    return a.overrides[propertyId] ? "on" : "off";
  }

  function overrideCount(a: Automation): number {
    return Object.keys(a.overrides).length;
  }

  // Per-property override editor — shared by grid + table.
  function PropertyOverrides({ a }: { a: Automation }) {
    if (properties.length === 0) return null;
    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={() => toggleExpanded(a.id)}
          className="flex items-center gap-1.5 text-xs font-sans text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", expanded.has(a.id) && "rotate-180")} />
          Customise per property
          {overrideCount(a) > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gold/15 text-gold-dark text-[10px] font-medium">
              {overrideCount(a)} override{overrideCount(a) === 1 ? "" : "s"}
            </span>
          )}
        </button>

        {expanded.has(a.id) && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] text-gray-400 font-sans">
              Each property inherits the organisation setting ({a.enabled ? "On" : "Off"}) unless overridden.
            </p>
            {properties.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-1">
                <span className="flex items-center gap-1.5 text-sm text-gray-700 font-sans min-w-0">
                  <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </span>
                <OverrideControl
                  state={overrideState(a, p.id)}
                  saving={saving === `${a.id}:${p.id}`}
                  onChange={(s) => setOverride(a, p.id, s)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <Header title="Automations" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        <Card padding="sm" className="bg-blue-50/50 border border-blue-100">
          <p className="text-xs text-blue-700 font-sans flex items-start gap-2">
            <Zap className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Control everything GroundWorkPM does for you automatically — workflow automations that
              open Cases, the email alerts your managers receive, and the proactive reminders in your
              Inbox. The main toggle applies to your whole organisation; expand{" "}
              <strong>Customise per property</strong> to override it for individual properties.
            </span>
          </p>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <>
            {/* View switcher */}
            <div className="flex justify-end">
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-pressed={view === "grid"}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-sans transition-colors",
                    view === "grid" ? "bg-gold text-white" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  <LayoutGrid className="w-4 h-4" /> Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  aria-pressed={view === "table"}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-sans transition-colors",
                    view === "table" ? "bg-gold text-white" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  <List className="w-4 h-4" /> Table
                </button>
              </div>
            </div>

            {SECTIONS.map((section) => {
              const items = automations.filter((a) => a.category === section.category);
              if (items.length === 0) return null;
              return (
                <div key={section.category} className="space-y-3">
                  <div>
                    <h2 className="font-display text-xl text-gray-900">{section.heading}</h2>
                    <p className="text-sm text-gray-500 font-sans mt-0.5">{section.blurb}</p>
                  </div>

                  {view === "grid" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {items.map((a) => (
                        <Card key={a.id} className="flex flex-col">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-display text-lg text-gray-900">{a.name}</h3>
                              <p className="text-sm text-gray-500 mt-1 font-sans">{a.description}</p>
                            </div>
                            <Toggle
                              enabled={a.enabled}
                              label={`${a.enabled ? "Disable" : "Enable"} ${a.name}`}
                              saving={saving === a.id}
                              onToggle={() => toggle(a)}
                            />
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-xs uppercase tracking-wide text-gray-400 font-sans">Trigger</p>
                            <p className="text-sm text-gray-700 font-sans mt-0.5">{a.trigger}</p>
                          </div>

                          <div className="mt-3">
                            <p className="text-xs uppercase tracking-wide text-gray-400 font-sans">Actions</p>
                            <ul className="mt-1 space-y-1">
                              {a.actions.map((act) => (
                                <li key={act} className="flex items-center gap-1.5 text-sm text-gray-700 font-sans">
                                  <Check className="w-4 h-4 text-income shrink-0" />
                                  {act}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <PropertyOverrides a={a} />
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card padding="none" className="overflow-hidden">
                      {/* Mobile: stacked rows */}
                      <ul className="md:hidden divide-y divide-gray-100">
                        {items.map((a) => (
                          <li key={a.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-sans font-medium text-gray-900">{a.name}</p>
                                <p className="text-xs text-gray-500 font-sans mt-0.5">{a.trigger}</p>
                              </div>
                              <Toggle
                                enabled={a.enabled}
                                label={`${a.enabled ? "Disable" : "Enable"} ${a.name}`}
                                saving={saving === a.id}
                                onToggle={() => toggle(a)}
                              />
                            </div>
                            <PropertyOverrides a={a} />
                          </li>
                        ))}
                      </ul>

                      {/* Desktop: table */}
                      <table className="hidden md:table w-full text-sm font-sans">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                            <th className="px-4 py-2.5 font-medium">Automation</th>
                            <th className="px-4 py-2.5 font-medium">Trigger</th>
                            <th className="px-4 py-2.5 font-medium">Actions</th>
                            <th className="px-4 py-2.5 font-medium text-right">Enabled</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map((a) => (
                            <Fragment key={a.id}>
                              <tr className="hover:bg-gray-50/60">
                                <td className="px-4 py-3 align-top">
                                  <p className="font-medium text-gray-900">{a.name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(a.id)}
                                    className="mt-1.5 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                                  >
                                    <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", expanded.has(a.id) && "rotate-180")} />
                                    Per property
                                    {overrideCount(a) > 0 && (
                                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gold/15 text-gold-dark text-[10px] font-medium">
                                        {overrideCount(a)}
                                      </span>
                                    )}
                                  </button>
                                </td>
                                <td className="px-4 py-3 align-top text-gray-700">{a.trigger}</td>
                                <td className="px-4 py-3 align-top text-gray-700">{a.actions.join(" · ")}</td>
                                <td className="px-4 py-3 align-top text-right">
                                  <Toggle
                                    enabled={a.enabled}
                                    label={`${a.enabled ? "Disable" : "Enable"} ${a.name}`}
                                    saving={saving === a.id}
                                    onToggle={() => toggle(a)}
                                  />
                                </td>
                              </tr>
                              {expanded.has(a.id) && properties.length > 0 && (
                                <tr className="bg-gray-50/40">
                                  <td colSpan={4} className="px-4 py-3">
                                    <p className="text-[11px] text-gray-400 font-sans mb-2">
                                      Each property inherits the organisation setting ({a.enabled ? "On" : "Off"}) unless overridden.
                                    </p>
                                    <div className="grid gap-1.5 sm:grid-cols-2">
                                      {properties.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between gap-3 py-0.5">
                                          <span className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0">
                                            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="truncate">{p.name}</span>
                                          </span>
                                          <OverrideControl
                                            state={overrideState(a, p.id)}
                                            saving={saving === `${a.id}:${p.id}`}
                                            onChange={(s) => setOverride(a, p.id, s)}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
