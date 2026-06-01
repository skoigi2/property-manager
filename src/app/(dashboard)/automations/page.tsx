"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Check, Zap } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";

type Category = "WORKFLOW" | "NOTIFICATION" | "REMINDER";

interface Automation {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  actions: string[];
  category: Category;
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

export default function AutomationsPage() {
  const { data: session } = useSession();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/automations")
      .then((r) => r.json())
      .then((d) => setAutomations(d.automations ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(a: Automation) {
    const next = !a.enabled;
    setSaving(a.id);
    // Optimistic update
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
      // Roll back
      setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: a.enabled } : x)));
      toast.error("Could not update automation");
    } finally {
      setSaving(null);
    }
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
              Inbox. Toggle any of them on or off. Workflow automations run once per item, so duplicates
              are prevented.
            </span>
          </p>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          SECTIONS.map((section) => {
            const items = automations.filter((a) => a.category === section.category);
            if (items.length === 0) return null;
            return (
              <div key={section.category} className="space-y-3">
                <div>
                  <h2 className="font-display text-xl text-gray-900">{section.heading}</h2>
                  <p className="text-sm text-gray-500 font-sans mt-0.5">{section.blurb}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {items.map((a) => (
                    <Card key={a.id} className="flex flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-display text-lg text-gray-900">{a.name}</h3>
                          <p className="text-sm text-gray-500 mt-1 font-sans">{a.description}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={a.enabled}
                          aria-label={`${a.enabled ? "Disable" : "Enable"} ${a.name}`}
                          disabled={saving === a.id}
                          onClick={() => toggle(a)}
                          className={clsx(
                            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                            a.enabled ? "bg-gold" : "bg-gray-300",
                            saving === a.id && "opacity-60"
                          )}
                        >
                          <span
                            className={clsx(
                              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                              a.enabled ? "translate-x-5" : "translate-x-0.5"
                            )}
                          />
                        </button>
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
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
