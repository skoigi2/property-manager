"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useProperty } from "@/lib/property-context";
import {
  CalendarRange, Copy, Check, Trash2, Plus, Download, ExternalLink, Info,
} from "lucide-react";
import { format } from "date-fns";

interface FeedRow {
  id: string;
  label: string;
  token: string;
  propertyIds: string[];
  createdAt: string;
  lastAccessedAt: string | null;
}

function CopyField({ value, hint }: { value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="flex-1 min-w-0 truncate bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-caption font-mono text-gray-600">
        {value}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        title={hint}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-caption text-gold hover:bg-gold/5 transition-colors"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function CalendarFeedSettingsPage() {
  const { data: session } = useSession();
  const { properties, selectedId } = useProperty();

  const [feeds, setFeeds] = useState<FeedRow[] | null>(null);
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<string>("__ALL__");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<FeedRow | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => { if (selectedId) setScope(selectedId); }, [selectedId]);

  async function load() {
    try {
      const r = await fetch("/api/calendar-feeds");
      const d = await r.json();
      setFeeds(d.feeds ?? []);
    } catch {
      setFeeds([]);
      toast.error("Couldn't load your calendar feeds");
    }
  }
  useEffect(() => { load(); }, []);

  async function createFeed() {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/calendar-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          propertyIds: scope === "__ALL__" ? [] : [scope],
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(typeof d?.error === "string" ? d.error : "Failed to create feed");
      }
      setLabel("");
      toast.success("Calendar feed created");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create feed");
    } finally {
      setCreating(false);
    }
  }

  async function revokeFeed(feed: FeedRow) {
    const r = await fetch(`/api/calendar-feeds/${feed.id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Feed revoked");
      load();
    } else {
      toast.error("Failed to revoke feed");
    }
    setRevoking(null);
  }

  const feedUrl = (t: string) => `${origin}/api/calendar/feed/${t}`;
  const webcalUrl = (t: string) => feedUrl(t).replace(/^https?:\/\//, "webcal://");

  return (
    <div>
      <Header
        title="Calendar Feed"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />

      <div className="page-container space-y-4 pb-24 lg:pb-8">

        <Card>
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center">
              <CalendarRange size={18} className="text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className=" text-h3 text-gray-900">Subscribe in your own calendar</h2>
              <p className="text-body text-gray-500 mt-1 ">
                Get lease expiries, rent due dates, compliance deadlines, insurance renewals and
                scheduled maintenance in Google, Outlook or Apple Calendar — updating on their own,
                no login needed. The feed is read-only and covers the last 90 days plus the year ahead.
              </p>
              <p className="text-caption text-gray-400 mt-2">
                Tenant names and amounts are deliberately left out, since the feed syncs to every
                device on that calendar account. Each entry links back here for the detail.
              </p>
            </div>
          </div>
        </Card>

        {/* ── Create ──────────────────────────────────────────────────────── */}
        <Card>
          <h3 className=" font-medium text-body text-gray-800 mb-3">New feed</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Input
              label="Label"
              placeholder="My phone"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              tooltip="Only for your reference — helps you tell feeds apart when revoking one."
            />
            <div>
              <label className="block text-body text-gray-600 mb-1.5">Properties</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-body focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                <option value="__ALL__">All properties I can access</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={createFeed} disabled={creating || !label.trim()}>
              <Plus size={14} /> {creating ? "Creating…" : "Create feed"}
            </Button>
          </div>
        </Card>

        {/* ── Existing feeds ──────────────────────────────────────────────── */}
        {feeds === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : feeds.length === 0 ? (
          <Card>
            <p className="text-body text-gray-400 text-center py-6">
              No calendar feeds yet. Create one above to subscribe from your phone or laptop.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {feeds.map((f) => (
              <Card key={f.id}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className=" font-medium text-body text-gray-800 truncate">{f.label}</p>
                    <p className="text-caption text-gray-400 mt-0.5">
                      {f.propertyIds.length === 0
                        ? "All accessible properties"
                        : properties.find((p) => p.id === f.propertyIds[0])?.name ?? "1 property"}
                      {" · created "}{format(new Date(f.createdAt), "d MMM yyyy")}
                      {" · "}
                      {f.lastAccessedAt
                        ? `last synced ${format(new Date(f.lastAccessedAt), "d MMM yyyy, HH:mm")}`
                        : "never synced"}
                    </p>
                  </div>
                  <button
                    onClick={() => setRevoking(f)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-caption text-expense hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} /> Revoke
                  </button>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-label uppercase text-gray-400 mb-1">
                      Subscription URL
                    </p>
                    <CopyField value={feedUrl(f.token)} hint="Copy the https:// feed URL" />
                  </div>
                  <div>
                    <p className="text-label uppercase text-gray-400 mb-1">
                      One-click (Apple Calendar / Outlook desktop)
                    </p>
                    <CopyField value={webcalUrl(f.token)} hint="Copy the webcal:// feed URL" />
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-caption text-blue-800 ">
                    <strong>Google Calendar:</strong> Other calendars → + → From URL → paste the
                    https:// link. <strong>Apple / Outlook desktop:</strong> open the webcal:// link.
                    Anyone with the URL can read this calendar, so treat it like a password —
                    revoke it here if it leaks.
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── One-off download ────────────────────────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className=" font-medium text-body text-gray-800">One-off download</h3>
              <p className="text-caption text-gray-400 mt-0.5">
                A snapshot .ics of the same date range. It won&apos;t update — subscribe above if you
                want it to stay current.
              </p>
            </div>
            <a
              href={`/api/calendar/export${selectedId ? `?propertyId=${selectedId}` : ""}`}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-body text-gray-600 hover:text-gold hover:border-gold transition-colors"
            >
              <Download size={14} /> Download .ics
            </a>
          </div>
        </Card>

        <a
          href="/calendar"
          className="inline-flex items-center gap-1.5 text-body text-gold hover:underline "
        >
          <ExternalLink size={13} /> Back to calendar
        </a>
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="Revoke this calendar feed?"
        message={
          revoking
            ? `"${revoking.label}" will stop updating immediately and anyone still subscribed will see an error. You can create a new feed at any time.`
            : ""
        }
        confirmLabel="Revoke feed"
        onConfirm={() => revoking && revokeFeed(revoking)}
      />
    </div>
  );
}
