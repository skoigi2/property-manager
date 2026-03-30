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
  Globe, Mail, Phone, MapPin, ChevronDown, ChevronRight,
  Pencil, UserCog, CalendarDays,
} from "lucide-react";

interface OrgUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
}

interface OrgProperty {
  id: string;
  name: string;
  type: string;
  propertyAccess: { user: OrgUser }[];
}

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
  properties: OrgProperty[];
  users: OrgUser[];
}

const roleBadge: Record<string, "green" | "blue" | "amber" | "gold" | "gray"> = {
  ADMIN: "gold", MANAGER: "green", OWNER: "blue", ACCOUNTANT: "amber",
};

const emptyForm = { name: "", address: "", phone: "", email: "", website: "" };

export default function OrganizationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createForm, setCreateForm] = useState({
    ...emptyForm,
    adminName: "", adminEmail: "", adminPassword: "",
  });

  // Edit modal
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Guard: only super-admin
  useEffect(() => {
    if (status === "loading") return;
    const isSuperAdmin = session?.user?.role === "ADMIN" && (session?.user as any)?.organizationId === null;
    if (!isSuperAdmin) router.replace("/dashboard");
  }, [session, status, router]);

  useEffect(() => { fetchOrgs(); }, []);

  async function fetchOrgs() {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data: Org[] = await res.json();
        setOrgs(data);
        // Auto-expand all orgs on first load
        setExpandedOrgs(new Set(data.map((o) => o.id)));
      }
    } finally { setLoading(false); }
  }

  function toggleExpand(orgId: string) {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      next.has(orgId) ? next.delete(orgId) : next.add(orgId);
      return next;
    });
  }

  async function createOrg() {
    if (!createForm.name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Failed to create");
      }
      toast.success(`Organisation "${createForm.name}" created`);
      setShowCreate(false);
      setCreateForm({ ...emptyForm, adminName: "", adminEmail: "", adminPassword: "" });
      fetchOrgs();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create organisation");
    } finally { setCreating(false); }
  }

  async function saveEdit() {
    if (!editOrg) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${editOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Organisation updated");
      setEditOrg(null);
      fetchOrgs();
    } catch {
      toast.error("Failed to save changes");
    } finally { setSaving(false); }
  }

  function openEdit(org: Org) {
    setEditOrg(org);
    setEditForm({
      name: org.name,
      address: org.address ?? "",
      phone: org.phone ?? "",
      email: org.email ?? "",
      website: org.website ?? "",
    });
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
          <p className="text-sm text-gray-500 font-sans">All companies using this platform. Each organisation has isolated data.</p>
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
          <div className="space-y-4">
            {orgs.map((org) => {
              const isExpanded = expandedOrgs.has(org.id);
              // Users not attached to any property (admins, owners, etc.)
              const propertyUserIds = new Set(
                org.properties.flatMap((p) => p.propertyAccess.map((a) => a.user.id))
              );
              const directUsers = org.users.filter((u) => !propertyUserIds.has(u.id));

              return (
                <Card key={org.id} className="overflow-hidden">
                  {/* Org header row */}
                  <div className="flex items-start gap-4">
                    {/* Logo */}
                    <div className="w-12 h-12 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        <Building2 size={20} className="text-gray-300" />
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
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEdit(org)}
                        className="text-xs font-sans text-gray-400 hover:text-gold transition-colors"
                        title="Edit organisation"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => toggleActive(org)}
                        className="text-xs font-sans text-gray-400 hover:text-gray-600 transition-colors"
                        title={org.isActive ? "Deactivate" : "Activate"}
                      >
                        {org.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        onClick={() => toggleExpand(org.id)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded hierarchy */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">

                      {/* Properties */}
                      {org.properties.length > 0 ? (
                        <div>
                          <p className="text-xs font-sans font-medium text-gray-400 uppercase tracking-wide mb-2">Properties</p>
                          <div className="space-y-3">
                            {org.properties.map((prop) => (
                              <div key={prop.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                {/* Property header */}
                                <div className="flex items-center gap-2 mb-2">
                                  {prop.type === "AIRBNB" ? (
                                    <CalendarDays size={14} className="text-gold shrink-0" />
                                  ) : (
                                    <Home size={14} className="text-gold shrink-0" />
                                  )}
                                  <span className="font-sans text-sm font-medium text-header">{prop.name}</span>
                                  <Badge variant={prop.type === "AIRBNB" ? "gold" : "blue"}>
                                    {prop.type === "AIRBNB" ? "Airbnb" : "Long-term"}
                                  </Badge>
                                </div>

                                {/* Users with access */}
                                {prop.propertyAccess.length > 0 ? (
                                  <div className="space-y-1.5 ml-5">
                                    {prop.propertyAccess.map(({ user }) => (
                                      <div key={user.id} className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                                          <UserCog size={10} className="text-gold" />
                                        </div>
                                        <span className="text-xs font-sans text-gray-700">{user.name ?? user.email}</span>
                                        <Badge variant={roleBadge[user.role] ?? "gray"}>{user.role}</Badge>
                                        {!user.isActive && <Badge variant="red">Inactive</Badge>}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 font-sans ml-5 italic">No users assigned</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 font-sans italic">No properties yet</p>
                      )}

                      {/* Direct / org-level users (not tied to a specific property) */}
                      {directUsers.length > 0 && (
                        <div>
                          <p className="text-xs font-sans font-medium text-gray-400 uppercase tracking-wide mb-2">Org-level Users</p>
                          <div className="space-y-1.5">
                            {directUsers.map((user) => (
                              <div key={user.id} className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                  <UserCog size={10} className="text-gray-400" />
                                </div>
                                <span className="text-xs font-sans text-gray-700">{user.name ?? user.email}</span>
                                <span className="text-xs text-gray-400 font-sans">{user.email}</span>
                                <Badge variant={roleBadge[user.role] ?? "gray"}>{user.role}</Badge>
                                {!user.isActive && <Badge variant="red">Inactive</Badge>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Organisation Modal */}
      {editOrg && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setEditOrg(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                <h2 className="font-display text-lg text-header">Edit Organisation</h2>
                <button onClick={() => setEditOrg(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-3">
                <Input label="Company Name *" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Phone" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                  <Input label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <Input label="Address" value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} />
                <Input label="Website" value={editForm.website} onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))} />
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <Button onClick={saveEdit} loading={saving} className="flex-1" disabled={!editForm.name}>
                  Save Changes
                </Button>
                <Button variant="secondary" onClick={() => setEditOrg(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </>
      )}

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
                  <Input label="Company Name *" value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Phone" value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
                    <Input label="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <Input label="Address" value={createForm.address} onChange={(e) => setCreateForm((p) => ({ ...p, address: e.target.value }))} />
                  <Input label="Website" value={createForm.website} onChange={(e) => setCreateForm((p) => ({ ...p, website: e.target.value }))} />
                </div>

                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 font-sans uppercase tracking-wide font-medium">First Admin User (optional)</p>
                  <p className="text-xs text-gray-500 font-sans">Creates an ADMIN user for this organisation so they can log in immediately.</p>
                  <Input label="Full Name" value={createForm.adminName} onChange={(e) => setCreateForm((p) => ({ ...p, adminName: e.target.value }))} />
                  <Input label="Email" type="email" value={createForm.adminEmail} onChange={(e) => setCreateForm((p) => ({ ...p, adminEmail: e.target.value }))} />
                  <div className="relative">
                    <Input
                      label="Password"
                      type={showPassword ? "text" : "password"}
                      value={createForm.adminPassword}
                      onChange={(e) => setCreateForm((p) => ({ ...p, adminPassword: e.target.value }))}
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
                <Button onClick={createOrg} loading={creating} className="flex-1" disabled={!createForm.name}>
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
