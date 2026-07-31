"use client";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Bell } from "lucide-react";
import { clsx } from "clsx";

type Category = "NOTIFICATION" | "WORKFLOW";

interface Pref {
  category: Category;
  emailEnabled: boolean;
}

const META: Record<Category, { title: string; blurb: string }> = {
  NOTIFICATION: {
    title: "Alert emails",
    blurb: "Lease expiry, overdue rent, compliance, insurance and urgent maintenance alerts.",
  },
  WORKFLOW: {
    title: "Workflow case emails",
    blurb: "Notifications when an automation opens or assigns a case automatically.",
  },
};

export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((d) => setPrefs(d.preferences ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(p: Pref) {
    const next = !p.emailEnabled;
    setSaving(p.category);
    setPrefs((prev) => prev.map((x) => (x.category === p.category ? { ...x, emailEnabled: next } : x)));
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: p.category, emailEnabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${META[p.category].title} ${next ? "on" : "off"}`);
    } catch {
      setPrefs((prev) => prev.map((x) => (x.category === p.category ? { ...x, emailEnabled: p.emailEnabled } : x)));
      toast.error("Could not update preference");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <Card padding="sm" className="bg-blue-50/50 border border-blue-100">
        <p className="text-caption text-blue-700 flex items-start gap-2">
          <Bell className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Choose which automation emails <strong>you</strong> receive. This only affects emails sent to
            your address — it doesn&apos;t change what&apos;s active for your organisation (manage that under
            Automations). Smart reminders are shown only in your Inbox and are never emailed.
          </span>
        </p>
      </Card>

      {prefs.map((p) => (
        <Card key={p.category}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className=" font-semibold text-header">{META[p.category].title}</h3>
              <p className="text-body text-gray-500 mt-1 ">{META[p.category].blurb}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={p.emailEnabled}
              aria-label={`${p.emailEnabled ? "Turn off" : "Turn on"} ${META[p.category].title}`}
              disabled={saving === p.category}
              onClick={() => toggle(p)}
              className={clsx(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                p.emailEnabled ? "bg-gold" : "bg-gray-300",
                saving === p.category && "opacity-60"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                  p.emailEnabled ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
