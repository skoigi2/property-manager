"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { KeyRound, Webhook, Copy, Plus, Trash2, Check } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdByEmail: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface EndpointRow {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs font-sans text-gold hover:text-gold-dark"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function ApiSettingsPage() {
  const { data: session } = useSession();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointRow[] | null>(null);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);

  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [creatingEp, setCreatingEp] = useState(false);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  async function load() {
    const [k, e] = await Promise.all([
      fetch("/api/api-keys").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/webhook-endpoints").then((r) => (r.ok ? r.json() : { endpoints: [], availableEvents: [] })),
    ]);
    setKeys(Array.isArray(k) ? k : []);
    setEndpoints(e.endpoints ?? []);
    setAvailableEvents(e.availableEvents ?? []);
  }
  useEffect(() => { load(); }, []);

  async function createKey() {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const r = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Failed");
      const d = await r.json();
      setFreshKey(d.rawKey);
      setNewKeyName("");
      load();
    } catch (e: any) {
      toast.error(typeof e?.message === "string" ? e.message : "Failed to create key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? Integrations using it will stop working immediately.")) return;
    const r = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Key revoked"); load(); } else toast.error("Failed to revoke");
  }

  async function createEndpoint() {
    if (!newUrl.trim() || newEvents.length === 0) return;
    setCreatingEp(true);
    try {
      const r = await fetch("/api/webhook-endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setFreshSecret(d.secret);
      setNewUrl("");
      setNewEvents([]);
      load();
    } catch {
      toast.error("Failed to add endpoint (must be a valid https URL)");
    } finally {
      setCreatingEp(false);
    }
  }

  async function deleteEndpoint(id: string) {
    if (!confirm("Delete this webhook endpoint?")) return;
    const r = await fetch(`/api/webhook-endpoints/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Endpoint deleted"); load(); } else toast.error("Failed to delete");
  }

  const loading = keys === null || endpoints === null;

  return (
    <div>
      <Header title="API & Webhooks" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-6">
        <p className="text-sm text-gray-500 font-sans max-w-2xl">
          Read-only programmatic access to your organisation&apos;s data, plus webhook
          notifications for key events. API keys carry full read access to your org —
          treat them like passwords.
        </p>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* ── API keys ── */}
            <Card>
              <h2 className="font-sans font-semibold text-header flex items-center gap-2 mb-1">
                <KeyRound size={16} className="text-gold" /> API keys
              </h2>
              <p className="text-xs text-gray-400 font-sans mb-4">
                Authenticate with <code className="bg-cream px-1.5 py-0.5 rounded">Authorization: Bearer gwpm_…</code> against{" "}
                <code className="bg-cream px-1.5 py-0.5 rounded">/api/v1/properties</code>,{" "}
                <code className="bg-cream px-1.5 py-0.5 rounded">/api/v1/tenants</code>, and{" "}
                <code className="bg-cream px-1.5 py-0.5 rounded">/api/v1/invoices</code>.
              </p>

              {freshKey && (
                <div className="mb-4 border border-amber-200 bg-amber-50 rounded-xl p-4">
                  <p className="text-xs font-sans font-semibold text-amber-800 mb-1">
                    Copy this key now — it won&apos;t be shown again.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="text-xs font-mono text-header break-all">{freshKey}</code>
                    <CopyButton value={freshKey} />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. Zapier integration)"
                  className="flex-1 max-w-sm border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans"
                />
                <Button size="sm" variant="gold" onClick={createKey} loading={creatingKey} disabled={!newKeyName.trim()}>
                  <Plus size={14} /> Create key
                </Button>
              </div>

              {keys!.length === 0 ? (
                <p className="text-sm text-gray-400 font-sans">No API keys yet.</p>
              ) : (
                <div className="space-y-2">
                  {keys!.map((k) => (
                    <div key={k.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-sans font-medium text-header">{k.name}</p>
                          {k.revokedAt ? <Badge variant="red">Revoked</Badge> : <Badge variant="green">Active</Badge>}
                        </div>
                        <p className="text-xs text-gray-400 font-sans font-mono mt-0.5">
                          {k.keyPrefix}…{" · "}
                          {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                        </p>
                      </div>
                      {!k.revokedAt && (
                        <button onClick={() => revokeKey(k.id)} className="text-gray-300 hover:text-expense p-1" title="Revoke">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── Webhooks ── */}
            <Card>
              <h2 className="font-sans font-semibold text-header flex items-center gap-2 mb-1">
                <Webhook size={16} className="text-gold" /> Webhook endpoints
              </h2>
              <p className="text-xs text-gray-400 font-sans mb-4">
                We POST a JSON payload to your https URL when subscribed events occur, signed with{" "}
                <code className="bg-cream px-1.5 py-0.5 rounded">X-GWPM-Signature: sha256=HMAC(secret, body)</code>.
              </p>

              {freshSecret && (
                <div className="mb-4 border border-amber-200 bg-amber-50 rounded-xl p-4">
                  <p className="text-xs font-sans font-semibold text-amber-800 mb-1">
                    Signing secret — copy it now, it won&apos;t be shown again.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="text-xs font-mono text-header break-all">{freshSecret}</code>
                    <CopyButton value={freshSecret} />
                  </div>
                </div>
              )}

              <div className="space-y-3 mb-4">
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/webhooks/groundworkpm"
                  className="w-full max-w-lg border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  {availableEvents.map((ev) => (
                    <button
                      key={ev}
                      onClick={() =>
                        setNewEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]))
                      }
                      className={`text-xs font-sans px-2.5 py-1 rounded-lg border transition-colors ${
                        newEvents.includes(ev)
                          ? "border-gold bg-gold/10 text-gold-dark font-medium"
                          : "border-gray-200 text-gray-500 hover:border-gold/40"
                      }`}
                    >
                      {ev}
                    </button>
                  ))}
                  <Button size="sm" variant="gold" onClick={createEndpoint} loading={creatingEp} disabled={!newUrl.trim() || newEvents.length === 0}>
                    <Plus size={14} /> Add endpoint
                  </Button>
                </div>
              </div>

              {endpoints!.length === 0 ? (
                <p className="text-sm text-gray-400 font-sans">No webhook endpoints yet.</p>
              ) : (
                <div className="space-y-2">
                  {endpoints!.map((ep) => (
                    <div key={ep.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl px-4 py-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-sans font-medium text-header truncate max-w-md">{ep.url}</p>
                          {ep.isActive ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Disabled</Badge>}
                          {ep.failureCount > 0 && <Badge variant="amber">{ep.failureCount} failures</Badge>}
                        </div>
                        <p className="text-xs text-gray-400 font-sans mt-0.5">{ep.events.join(", ")}</p>
                      </div>
                      <button onClick={() => deleteEndpoint(ep.id)} className="text-gray-300 hover:text-expense p-1" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
