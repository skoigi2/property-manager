"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import {
  Building2, Plus, Users, Home, X, Eye, EyeOff,
  Globe, Mail, Phone, MapPin,
} from "lucide-react";

interface Org {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; properties: number };
}

export default function OrganizationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "", address: "", phone: "", email: "", website: "",
    adminName: "", adminEmail: "", adminPassword: "",
  });

  // Guard: only super-admin
  useEffect(() => {
    if (status === "loading") return;
    const isSuperAdmin = session?.user?.role === "ADMIN" && session?.user?.organizationId === null;
    if (!isSuperAdmin) router.replace("/dashboard");
  }, [session, status, router]);

  useEffect(() => { fetchOrgs(); }, []);

  async function fetchOrgs() {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) setOrgs(await res.json());
    } finally { setLoading(false); }
  }

  async function createOrg() {
    if (!form.name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Failed to create");
      }
      toast.success(`Organisation "${form.name}" created`);
      setShowCreate(false);
      setForm({ name: "", address: "", phone: "", email: "", website: "", adminName: "", adminEmail: "", adminPassword: "" });
      fetchOrgs();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create organisation");
    } finally { setCreating(false); }
  }

  async function toggleActive(org: Org) {
    try {
      await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !org.isActive }),
      });
      fetchOrgs();
    } catch { toast.error("Failed to update"); }
  }

  const isSuperAdmin = session?.user?.role === "ADMIN" && (session?.user as any)?.organizationId === null;
  if (!isSuperAdmin && status !== "loading") return null;

  return (
    <div>
      <Header title="Organisations" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-sans">All companies using this platform. Each organisation has isolated data.</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Organisation
          </Button>
        </div>

        {/* Org list */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : orgs.length === 0 ? (
          <Card>
            <div className="text-center py-10">
              <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-sans text-sm">No organisations yet.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => (
              <Card key={org.id}>
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  <div className="w-14 h-14 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {org.logoUrl ? (
                      <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Building2 size={22} className="text-gray-300" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-base text-header">{org.name}</h3>
                      <Badge variant={org.isActive ? "green" : "gray"}>{org.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-gray-400 font-sans">
                        <Users size={11} /> {org._count.users} user{org._count.users !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400 font-sans">
                        <Home size={11} /> {org._count.properties} propert{org._count.properties !== 1 ? "ies" : "y"}
                      </span>
                      {org.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 font-sans">
                          <Mail size={11} /> {org.email}
                        </span>
                      )}
                      {org.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 font-sans">
                          <Phone size={11} /> {org.phone}
                        </span>
                      )}
                      {org.address && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 font-sans">
                          <MapPin size={11} /> {org.address}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => toggleActive(org)}
                    className="text-xs font-sans text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                    title={org.isActive ? "Deactivate" : "Activate"}
                  >
                    {org.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Organisation Modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 sticky top-0 bg-white">
                <h2 className="font-display text-lg text-header">New Organisation</h2>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 font-sans uppercase tracking-wide font-medium">Organisation Details</p>
                  <Input label="Company Name *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                    <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <Input label="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                  <Input label="Website" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
                </div>

                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 font-sans uppercase tracking-wide font-medium">First Admin User (optional)</p>
                  <p className="text-xs text-gray-500 font-sans">Creates an ADMIN user for this organisation so they can log in immediately.</p>
                  <Input label="Full Name" value={form.adminName} onChange={(e) => setForm((p) => ({ ...p, adminName: e.target.value }))} />
                  <Input label="Email" type="email" value={form.adminEmail} onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))} />
                  <div className="relative">
                    <Input
                      label="Password"
                      type={showPassword ? "text" : "password"}
                      value={form.adminPassword}
                      onChange={(e) => setForm((p) => ({ ...p, adminPassword: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-8 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 px-6 pb-6">
                <Button onClick={createOrg} loading={creating} className="flex-1" disabled={!form.name}>
                  Create Organisation
                </Button>
                <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
