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
  Mail, Phone, MapPin, ChevronDown, ChevronRight,
  Pencil, UserCog, CalendarDays, MoveRight, UserPlus, Trash2, Sparkles, Crown,
  ArrowUp, ArrowLeftRight,
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
  owner: OrgUser | null;
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
  freeAccess: boolean;
  pricingTier: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  _count: { memberships: number; properties: number };
  properties: OrgProperty[];
  memberships: { user: OrgUser; role: string; isBillingOwner: boolean }[];
}

const roleBadge: Record<string, "green" | "blue" | "amber" | "gold" | "gray"> = {
  ADMIN: "gold", MANAGER: "green", OWNER: "blue", ACCOUNTANT: "amber",
};

const emptyForm = { name: "", address: "", phone: "", email: "", website: "" };
const emptyAddUser = { name: "", email: "", password: "", role: "MANAGER", phone: "", propertyIds: [] as string[] };

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
  const [editTab, setEditTab] = useState<"details" | "users">("details");
  const [saving, setSaving] = useState(false);

  // Users tab state (within edit modal)
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserMode, setAddUserMode] = useState<"new" | "existing">("new");
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);
  const [addUserForm, setAddUserForm] = useState(emptyAddUser);
  const [addingUser, setAddingUser] = useState(false);
  const [removingUser, setRemovingUser] = useState<string | null>(null);

  // Existing-user picker state
  const [allUsers, setAllUsers] = useState<{ id: string; name: string | null; email: string | null; role: string; organizationId: string | null }[]>([]);
  const [existingUserSearch, setExistingUserSearch] = useState("");
  const [selectedExistingUserId, setSelectedExistingUserId] = useState<string | null>(null);
  const [existingUserPropertyIds, setExistingUserPropertyIds] = useState<string[]>([]);

  // Reassign users directly
  const [reassigning, setReassigning] = useState<string | null>(null); // "user-{id}"
  const [assigningBillingOwner, setAssigningBillingOwner] = useState<string | null>(null); // userId

  // Org-level ↔ property-level management
  const [promotingOrgLevel, setPromotingOrgLevel] = useState<string | null>(null); // userId
  const [movingToOrg, setMovingToOrg] = useState<string | null>(null); // userId whose org-move select is open
  const [assignPropertyOpen, setAssignPropertyOpen] = useState<string | null>(null); // userId whose property picker is open
  const [assignPropertyIds, setAssignPropertyIds] = useState<string[]>([]); // selected property IDs for picker
  const [grantingAccess, setGrantingAccess] = useState<string | null>(null); // userId being granted access

  // Property move confirmation flow
  interface PendingMove {
    propertyId: string;
    propertyName: string;
    sourceOrgName: string;
    targetOrgId: string;
    targetOrgName: string;
    willLeaveSource: OrgUser[];
    willRemainInSource: OrgUser[];
    loadingPreview: boolean;
  }
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Guard: only super-admin
  useEffect(() => {
    if (status === "loading") return;
    const isSuperAdmin = session?.user?.role === "ADMIN" && (session?.user as any)?.organizationId === null;
    if (!isSuperAdmin) router.replace("/dashboard");
  }, [session, status, router]);

  useEffect(() => { fetchOrgs(); }, []);

  // Load all users once when the Users tab is first opened (for existing-user picker)
  useEffect(() => {
    if (editTab === "users" && allUsers.length === 0) {
      fetch("/api/users").then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) setAllUsers(data);
      }).catch(() => {});
    }
  }, [editTab, allUsers.length]);

  async function fetchOrgs(): Promise<Org[]> {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data: Org[] = await res.json();
        setOrgs(data);
        setExpandedOrgs(new Set(data.map((o) => o.id)));
        return data;
      }
      return [];
    } finally { setLoading(false); }
  }

  function toggleExpand(orgId: string) {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) { next.delete(orgId); } else { next.add(orgId); }
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
    setEditTab("details");
    setShowAddUser(false);
    setAddUserMode("new");
    setShowAddUserPassword(false);
    setAddUserForm(emptyAddUser);
    setSelectedExistingUserId(null);
    setExistingUserPropertyIds([]);
    setExistingUserSearch("");
    setEditForm({
      name: org.name,
      address: org.address ?? "",
      phone: org.phone ?? "",
      email: org.email ?? "",
      website: org.website ?? "",
    });
  }

  async function addUserToOrg() {
    if (!editOrg) return;
    setAddingUser(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addUserForm,
          organizationId: editOrg.id,
          propertyIds: addUserForm.propertyIds.length ? addUserForm.propertyIds : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to add user");
      }
      toast.success(`${addUserForm.name || addUserForm.email} added`);
      setShowAddUser(false);
      setAddUserForm(emptyAddUser);
      const fresh = await fetchOrgs();
      const updated = fresh.find((o) => o.id === editOrg.id);
      if (updated) setEditOrg(updated);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add user");
    } finally { setAddingUser(false); }
  }

  async function addExistingUserToOrg() {
    if (!editOrg || !selectedExistingUserId) return;
    setAddingUser(true);
    try {
      const res = await fetch(`/api/organizations/${editOrg.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedExistingUserId,
          propertyIds: existingUserPropertyIds.length ? existingUserPropertyIds : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to add user");
      }
      toast.success("User added to organisation");
      setShowAddUser(false);
      setSelectedExistingUserId(null);
      setExistingUserPropertyIds([]);
      setExistingUserSearch("");
      const fresh = await fetchOrgs();
      const updated = fresh.find((o) => o.id === editOrg.id);
      if (updated) setEditOrg(updated);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add user");
    } finally { setAddingUser(false); }
  }

  async function removeFromOrg(orgId: string, userId: string) {
    setRemovingUser(userId);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to remove user");
      }
      toast.success("User removed from organisation");
      const fresh = await fetchOrgs();
      const updated = fresh.find((o) => o.id === orgId);
      if (updated) setEditOrg(updated);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to remove user");
    } finally { setRemovingUser(null); }
  }

  async function openMoveConfirmation(
    propertyId: string, propertyName: string, sourceOrgName: string,
    targetOrgId: string, targetOrgName: string
  ) {
    setPendingMove({
      propertyId, propertyName, sourceOrgName, targetOrgId, targetOrgName,
      willLeaveSource: [], willRemainInSource: [], loadingPreview: true,
    });
    try {
      const res = await fetch(`/api/properties/${propertyId}/reassign-preview?targetOrgId=${targetOrgId}`);
      if (res.ok) {
        const preview = await res.json();
        setPendingMove((p) => p ? { ...p, ...preview, loadingPreview: false } : null);
      } else {
        setPendingMove((p) => p ? { ...p, loadingPreview: false } : null);
      }
    } catch {
      setPendingMove((p) => p ? { ...p, loadingPreview: false } : null);
    }
  }

  async function confirmMove() {
    if (!pendingMove) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/properties/${pendingMove.propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: pendingMove.targetOrgId }),
      });
      if (!res.ok) throw new Error("Failed to move property");
      toast.success(`"${pendingMove.propertyName}" moved to ${pendingMove.targetOrgName}`);
      setPendingMove(null);
      fetchOrgs();
    } catch {
      toast.error("Failed to move property");
    } finally { setConfirming(false); }
  }

  async function reassignUser(userId: string, targetOrgId: string | null) {
    const key = `user-${userId}`;
    setReassigning(key);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });
      if (!res.ok) throw new Error("Failed to reassign user");
      toast.success("User moved");
      fetchOrgs();
    } catch {
      toast.error("Failed to reassign user");
    } finally { setReassigning(null); }
  }

  async function makeOrgLevel(orgId: string, userId: string) {
    setPromotingOrgLevel(userId);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${userId}/properties`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to promote user to org-level");
      toast.success("User is now org-level");
      fetchOrgs();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setPromotingOrgLevel(null); }
  }

  async function grantPropertyAccess(orgId: string, userId: string, propertyIds: string[]) {
    if (!propertyIds.length) return;
    setGrantingAccess(userId);
    try {
      await Promise.all(
        propertyIds.map((propertyId) =>
          fetch(`/api/users/${userId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId, grant: true }),
          })
        )
      );
      toast.success("Property access granted");
      setAssignPropertyOpen(null);
      setAssignPropertyIds([]);
      fetchOrgs();
    } catch {
      toast.error("Failed to grant access");
    } finally { setGrantingAccess(null); }
  }

  async function assignBillingOwner(orgId: string, newOwnerId: string) {
    setAssigningBillingOwner(newOwnerId);
    try {
      const res = await fetch(`/api/organizations/${orgId}/billing-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to assign billing owner");
      }
      toast.success("Billing owner updated");
      const fresh = await fetchOrgs();
      const updated = fresh.find((o) => o.id === orgId);
      if (updated) setEditOrg(updated);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to assign billing owner");
    } finally { setAssigningBillingOwner(null); }
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

  async function toggleFreeAccess(org: Org) {
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeAccess: !org.freeAccess }),
      });
      if (!res.ok) throw new Error();
      toast.success(org.freeAccess ? `Free access removed from "${org.name}"` : `Free access granted to "${org.name}"`);
      fetchOrgs();
    } catch { toast.error("Failed to update free access"); }
  }

  function subscriptionLabel(org: Org): { label: string; variant: "green" | "gold" | "blue" | "amber" | "red" | "gray" } {
    if (org.freeAccess) return { label: "Free Access", variant: "gold" };
    if (org.pricingTier !== "TRIAL") {
      if (org.subscriptionStatus === "active") return { label: org.pricingTier, variant: "green" };
      if (org.subscriptionStatus === "past_due") return { label: "Past Due", variant: "amber" };
      if (org.subscriptionStatus === "canceled") return { label: "Canceled", variant: "red" };
      return { label: org.pricingTier, variant: "gray" };
    }
    const daysLeft = org.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000))
      : 0;
    if (daysLeft > 0) return { label: `Trial · ${daysLeft}d`, variant: "blue" };
    return { label: "Trial Expired", variant: "red" };
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
              const propertyUserIds = new Set([
                ...org.properties.flatMap((p) => p.propertyAccess.map((a) => a.user.id)),
                ...org.properties.flatMap((p) => p.owner ? [p.owner.id] : []),
              ]);
              // Per-org role lookup: membership role takes precedence over global user.role
              const membershipRoleMap = new Map(org.memberships.map((m) => [m.user.id, m.role]));
              const billingOwnerSet = new Set(org.memberships.filter((m) => m.isBillingOwner).map((m) => m.user.id));
              const memberUsers = org.memberships.map((m) => m.user);
              const directUsers = memberUsers.filter((u) => !propertyUserIds.has(u.id));

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
                        {(() => { const s = subscriptionLabel(org); return <Badge variant={s.variant}>{s.label}</Badge>; })()}
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-gray-400 font-sans">
                          <Users size={11} /> {org._count.memberships} user{org._count.memberships !== 1 ? "s" : ""}
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
                        onClick={() => toggleFreeAccess(org)}
                        className={`text-xs font-sans transition-colors ${org.freeAccess ? "text-gold hover:text-gold-dark" : "text-gray-300 hover:text-gold"}`}
                        title={org.freeAccess ? "Revoke free access" : "Grant free access (Complimentary PRO)"}
                      >
                        <Sparkles size={15} />
                      </button>
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
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  {prop.type === "AIRBNB" ? (
                                    <CalendarDays size={14} className="text-gold shrink-0" />
                                  ) : (
                                    <Home size={14} className="text-gold shrink-0" />
                                  )}
                                  <span className="font-sans text-sm font-medium text-header">{prop.name}</span>
                                  <Badge variant={prop.type === "AIRBNB" ? "gold" : "blue"}>
                                    {prop.type === "AIRBNB" ? "Airbnb" : "Long-term"}
                                  </Badge>
                                  <div className="ml-auto flex items-center gap-1.5">
                                    <MoveRight size={12} className="text-gray-300" />
                                    <select
                                      className="text-xs font-sans border border-gray-200 rounded-lg px-2 py-1 text-gray-500 bg-white focus:outline-none focus:ring-1 focus:ring-gold disabled:opacity-50"
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          const targetOrg = orgs.find((o) => o.id === e.target.value);
                                          openMoveConfirmation(prop.id, prop.name, org.name, e.target.value, targetOrg?.name ?? "");
                                        }
                                      }}
                                    >
                                      <option value="" disabled>Move to…</option>
                                      {orgs.filter((o) => o.id !== org.id).map((o) => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Users with access (owner + property access) */}
                                {(prop.owner || prop.propertyAccess.length > 0) ? (
                                  <div className="space-y-1.5 ml-5">
                                    {/* Owner row */}
                                    {prop.owner && (
                                      <div key={prop.owner.id} className="flex items-center gap-2 flex-wrap">
                                        <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                          <UserCog size={10} className="text-blue-400" />
                                        </div>
                                        <span className="text-xs font-sans text-gray-700">{prop.owner.name ?? prop.owner.email}</span>
                                        <Badge variant="blue">OWNER</Badge>
                                        {!prop.owner.isActive && <Badge variant="red">Inactive</Badge>}
                                        <div className="ml-auto flex items-center gap-1.5">
                                          <MoveRight size={11} className="text-gray-300" />
                                          <select
                                            className="text-xs font-sans border border-gray-200 rounded-lg px-2 py-1 text-gray-500 bg-white focus:outline-none focus:ring-1 focus:ring-gold disabled:opacity-50"
                                            defaultValue=""
                                            disabled={reassigning === `user-${prop.owner.id}`}
                                            onChange={(e) => { if (e.target.value) reassignUser(prop.owner!.id, e.target.value); }}
                                          >
                                            <option value="" disabled>Move to…</option>
                                            {orgs.filter((o) => o.id !== org.id).map((o) => (
                                              <option key={o.id} value={o.id}>{o.name}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    )}
                                    {/* PropertyAccess users */}
                                    {prop.propertyAccess.map(({ user }) => (
                                      <div key={user.id} className="flex items-center gap-2 flex-wrap">
                                        <div className="w-5 h-5 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                                          <UserCog size={10} className="text-gold" />
                                        </div>
                                        <span className="text-xs font-sans text-gray-700">{user.name ?? user.email}</span>
                                        {(() => { const r = membershipRoleMap.get(user.id) ?? user.role; return <Badge variant={roleBadge[r] ?? "gray"}>{r}</Badge>; })()}
                                        {billingOwnerSet.has(user.id) && <span title="Billing owner"><Crown size={10} className="text-amber-500 shrink-0" /></span>}
                                        {!user.isActive && <Badge variant="red">Inactive</Badge>}
                                        <div className="ml-auto flex items-center gap-1">
                                          {/* Promote to org-level */}
                                          <button
                                            onClick={() => makeOrgLevel(org.id, user.id)}
                                            disabled={promotingOrgLevel === user.id}
                                            className="p-1 text-gray-300 hover:text-blue-500 transition-colors disabled:opacity-50 rounded"
                                            title="Promote to org-level (remove property access)"
                                          >
                                            {promotingOrgLevel === user.id
                                              ? <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-transparent animate-spin inline-block" />
                                              : <ArrowUp size={13} />}
                                          </button>
                                          {/* Move to another org */}
                                          {movingToOrg === user.id ? (
                                            <select
                                              autoFocus
                                              className="text-xs font-sans border border-gray-200 rounded-lg px-2 py-1 text-gray-500 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                                              defaultValue=""
                                              onBlur={() => setMovingToOrg(null)}
                                              onChange={(e) => { if (e.target.value) { reassignUser(user.id, e.target.value); setMovingToOrg(null); } }}
                                            >
                                              <option value="" disabled>Move to org…</option>
                                              {orgs.filter((o) => o.id !== org.id).map((o) => (
                                                <option key={o.id} value={o.id}>{o.name}</option>
                                              ))}
                                            </select>
                                          ) : (
                                            <button
                                              onClick={() => setMovingToOrg(user.id)}
                                              className="p-1 text-gray-300 hover:text-gray-600 transition-colors rounded"
                                              title="Move to another organisation"
                                            >
                                              <ArrowLeftRight size={13} />
                                            </button>
                                          )}
                                        </div>
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
                              <div key={user.id} className="flex items-center gap-2 flex-wrap">
                                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                  <UserCog size={10} className="text-gray-400" />
                                </div>
                                <span className="text-xs font-sans text-gray-700">{user.name ?? user.email}</span>
                                <span className="text-xs text-gray-400 font-sans">{user.email}</span>
                                {(() => { const r = membershipRoleMap.get(user.id) ?? user.role; return <Badge variant={roleBadge[r] ?? "gray"}>{r}</Badge>; })()}
                                {billingOwnerSet.has(user.id) && <span title="Billing owner"><Crown size={10} className="text-amber-500 shrink-0" /></span>}
                                {!user.isActive && <Badge variant="red">Inactive</Badge>}
                                <div className="ml-auto flex items-center gap-1">
                                  {/* Assign to property */}
                                  {org.properties.length > 0 && (
                                    assignPropertyOpen === user.id ? (
                                      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1">
                                        {org.properties.map((p) => (
                                          <label key={p.id} className="flex items-center gap-1 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={assignPropertyIds.includes(p.id)}
                                              onChange={(e) =>
                                                setAssignPropertyIds((prev) =>
                                                  e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                                                )
                                              }
                                              className="rounded border-gray-300 accent-gold"
                                            />
                                            <span className="text-xs font-sans text-gray-600 whitespace-nowrap">{p.name}</span>
                                          </label>
                                        ))}
                                        <button
                                          onClick={() => grantPropertyAccess(org.id, user.id, assignPropertyIds)}
                                          disabled={!assignPropertyIds.length || grantingAccess === user.id}
                                          className="text-xs font-sans text-gold font-medium hover:text-gold-dark disabled:opacity-40 ml-1 whitespace-nowrap"
                                        >
                                          {grantingAccess === user.id ? "…" : "Apply"}
                                        </button>
                                        <button onClick={() => { setAssignPropertyOpen(null); setAssignPropertyIds([]); }} className="text-gray-400 hover:text-gray-600 ml-0.5">
                                          <X size={11} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => { setAssignPropertyOpen(user.id); setAssignPropertyIds([]); }}
                                        className="p-1 text-gray-300 hover:text-green-600 transition-colors rounded"
                                        title="Assign to a property"
                                      >
                                        <Home size={13} />
                                      </button>
                                    )
                                  )}
                                  {/* Move to another org */}
                                  {movingToOrg === user.id ? (
                                    <select
                                      autoFocus
                                      className="text-xs font-sans border border-gray-200 rounded-lg px-2 py-1 text-gray-500 bg-white focus:outline-none focus:ring-1 focus:ring-gold"
                                      defaultValue=""
                                      onBlur={() => setMovingToOrg(null)}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) { reassignUser(user.id, val === "__none__" ? null : val); setMovingToOrg(null); }
                                      }}
                                    >
                                      <option value="" disabled>Move to org…</option>
                                      {orgs.filter((o) => o.id !== org.id).map((o) => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                      ))}
                                      <option value="__none__">— No organisation (super-admin)</option>
                                    </select>
                                  ) : (
                                    <button
                                      onClick={() => setMovingToOrg(user.id)}
                                      className="p-1 text-gray-300 hover:text-gray-600 transition-colors rounded"
                                      title="Move to another organisation"
                                    >
                                      <ArrowLeftRight size={13} />
                                    </button>
                                  )}
                                </div>
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

      {/* Property Move Confirmation Modal */}
      {pendingMove && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => !confirming && setPendingMove(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                <h2 className="font-display text-lg text-header">Confirm Property Move</h2>
                {!confirming && (
                  <button onClick={() => setPendingMove(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X size={20} />
                  </button>
                )}
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm font-sans text-gray-600">
                  Move <span className="font-medium text-header">{pendingMove.propertyName}</span> from{" "}
                  <span className="font-medium text-header">{pendingMove.sourceOrgName}</span> to{" "}
                  <span className="font-medium text-header">{pendingMove.targetOrgName}</span>?
                </p>

                {pendingMove.loadingPreview ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 font-sans">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent animate-spin" />
                    Checking affected users…
                  </div>
                ) : (
                  <>
                    {pendingMove.willLeaveSource.length > 0 && (
                      <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                        <p className="text-xs font-sans font-medium text-blue-700 mb-2">
                          Moving to {pendingMove.targetOrgName}
                        </p>
                        <div className="space-y-1">
                          {pendingMove.willLeaveSource.map((u) => (
                            <div key={u.id} className="flex items-center gap-2">
                              <UserCog size={11} className="text-blue-400 shrink-0" />
                              <span className="text-xs font-sans text-blue-700">{u.name ?? u.email}</span>
                              <Badge variant={roleBadge[u.role] ?? "gray"}>{u.role}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pendingMove.willRemainInSource.length > 0 && (
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                        <p className="text-xs font-sans font-medium text-amber-700 mb-1">
                          Staying in {pendingMove.sourceOrgName}
                        </p>
                        <p className="text-xs font-sans text-amber-600 mb-2">
                          These users have other properties in {pendingMove.sourceOrgName} and will also gain access to {pendingMove.targetOrgName}.
                        </p>
                        <div className="space-y-1">
                          {pendingMove.willRemainInSource.map((u) => (
                            <div key={u.id} className="flex items-center gap-2">
                              <UserCog size={11} className="text-amber-400 shrink-0" />
                              <span className="text-xs font-sans text-amber-700">{u.name ?? u.email}</span>
                              <Badge variant={roleBadge[u.role] ?? "gray"}>{u.role}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pendingMove.willLeaveSource.length === 0 && pendingMove.willRemainInSource.length === 0 && (
                      <p className="text-xs text-gray-400 font-sans italic">No users will be affected.</p>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <Button onClick={confirmMove} loading={confirming} className="flex-1" disabled={pendingMove.loadingPreview}>
                  Confirm Move
                </Button>
                <Button variant="secondary" onClick={() => setPendingMove(null)} disabled={confirming}>Cancel</Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Organisation Modal — tabbed: Details | Users */}
      {editOrg && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => { if (!saving && !addingUser && !removingUser) setEditOrg(null); }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
                <h2 className="font-display text-lg text-header">Edit Organisation</h2>
                <button
                  onClick={() => setEditOrg(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 shrink-0">
                <button
                  onClick={() => setEditTab("details")}
                  className={`flex-1 py-2.5 text-sm font-sans font-medium transition-colors ${
                    editTab === "details"
                      ? "text-gold border-b-2 border-gold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setEditTab("users")}
                  className={`flex-1 py-2.5 text-sm font-sans font-medium transition-colors ${
                    editTab === "users"
                      ? "text-gold border-b-2 border-gold"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  Users ({editOrg.memberships.length})
                </button>
              </div>

              {/* Scrollable tab content */}
              <div className="overflow-y-auto flex-1">

                {/* ── Details tab ── */}
                {editTab === "details" && (
                  <div className="px-6 py-5 space-y-3">
                    <Input
                      label="Company Name *"
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Phone"
                        value={editForm.phone}
                        onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <Input
                      label="Address"
                      value={editForm.address}
                      onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                    />
                    <Input
                      label="Website"
                      value={editForm.website}
                      onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))}
                    />
                  </div>
                )}

                {/* ── Users tab ── */}
                {editTab === "users" && (
                  <div className="px-6 py-5 space-y-4">

                    {/* Add user button / inline form */}
                    {!showAddUser ? (
                      <button
                        onClick={() => setShowAddUser(true)}
                        className="flex items-center gap-2 text-sm font-sans text-gold hover:text-gold-dark transition-colors"
                      >
                        <UserPlus size={15} /> Add User
                      </button>
                    ) : (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                        {/* Mode toggle */}
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
                          <button
                            onClick={() => setAddUserMode("new")}
                            className={`px-3 py-1 rounded-md text-xs font-sans font-medium transition-colors ${addUserMode === "new" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            New User
                          </button>
                          <button
                            onClick={() => setAddUserMode("existing")}
                            className={`px-3 py-1 rounded-md text-xs font-sans font-medium transition-colors ${addUserMode === "existing" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                          >
                            Existing User
                          </button>
                        </div>

                        {addUserMode === "new" ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                label="Full Name *"
                                value={addUserForm.name}
                                onChange={(e) => setAddUserForm((p) => ({ ...p, name: e.target.value }))}
                              />
                              <Input
                                label="Phone"
                                value={addUserForm.phone}
                                onChange={(e) => setAddUserForm((p) => ({ ...p, phone: e.target.value }))}
                              />
                            </div>
                            <Input
                              label="Email *"
                              type="email"
                              value={addUserForm.email}
                              onChange={(e) => setAddUserForm((p) => ({ ...p, email: e.target.value }))}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-sans text-gray-500 mb-1">Role *</label>
                                <select
                                  value={addUserForm.role}
                                  onChange={(e) => setAddUserForm((p) => ({ ...p, role: e.target.value }))}
                                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-sans text-gray-700 focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white"
                                >
                                  <option value="MANAGER">Manager</option>
                                  <option value="ACCOUNTANT">Accountant</option>
                                  <option value="OWNER">Owner</option>
                                </select>
                              </div>
                              <div className="relative">
                                <Input
                                  label="Password *"
                                  type={showAddUserPassword ? "text" : "password"}
                                  value={addUserForm.password}
                                  onChange={(e) => setAddUserForm((p) => ({ ...p, password: e.target.value }))}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowAddUserPassword((v) => !v)}
                                  className="absolute right-3 top-7 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                  {showAddUserPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              </div>
                            </div>
                            {/* Property access */}
                            {addUserForm.role !== "OWNER" && editOrg.properties.length > 0 && (
                              <div>
                                <p className="text-xs font-sans text-gray-500 mb-1">Property Access</p>
                                <p className="text-xs font-sans text-gray-400 mb-2">Leave unchecked to add as org-level user (no property-specific access)</p>
                                <div className="space-y-1.5">
                                  {editOrg.properties.map((prop) => (
                                    <label key={prop.id} className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={addUserForm.propertyIds.includes(prop.id)}
                                        onChange={(e) =>
                                          setAddUserForm((prev) => ({
                                            ...prev,
                                            propertyIds: e.target.checked
                                              ? [...prev.propertyIds, prop.id]
                                              : prev.propertyIds.filter((id) => id !== prop.id),
                                          }))
                                        }
                                        className="rounded border-gray-300 text-gold focus:ring-gold/30"
                                      />
                                      <span className="text-sm font-sans text-gray-700">{prop.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <Button
                                onClick={addUserToOrg}
                                loading={addingUser}
                                disabled={!addUserForm.name || !addUserForm.email || addUserForm.password.length < 6}
                              >
                                Add User
                              </Button>
                              <Button variant="secondary" onClick={() => { setShowAddUser(false); setAddUserForm(emptyAddUser); setShowAddUserPassword(false); }}>
                                Cancel
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Existing user search */}
                            <Input
                              label="Search users"
                              placeholder="Name or email…"
                              value={existingUserSearch}
                              onChange={(e) => { setExistingUserSearch(e.target.value); setSelectedExistingUserId(null); }}
                            />
                            {(() => {
                              const alreadyInOrg = new Set(editOrg.memberships.map((m) => m.user.id));
                              const filtered = allUsers.filter((u) =>
                                !alreadyInOrg.has(u.id) &&
                                existingUserSearch.length >= 1 &&
                                (`${u.name ?? ""} ${u.email ?? ""}`).toLowerCase().includes(existingUserSearch.toLowerCase())
                              );
                              return filtered.length > 0 ? (
                                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                  {filtered.map((u) => (
                                    <button
                                      key={u.id}
                                      onClick={() => { setSelectedExistingUserId(u.id); setExistingUserSearch(`${u.name ?? u.email ?? ""}`); }}
                                      className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors ${selectedExistingUserId === u.id ? "bg-gold/5" : ""}`}
                                    >
                                      <div>
                                        <p className="text-sm font-sans font-medium text-gray-800">{u.name ?? "—"}</p>
                                        <p className="text-xs font-sans text-gray-500">{u.email}</p>
                                      </div>
                                      <span className="text-xs font-sans text-gray-400">{u.role}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : existingUserSearch.length >= 1 ? (
                                <p className="text-xs font-sans text-gray-400 italic">No matching users outside this organisation.</p>
                              ) : null;
                            })()}
                            {/* Property access for existing user */}
                            {selectedExistingUserId && editOrg.properties.length > 0 && (
                              <div>
                                <p className="text-xs font-sans text-gray-500 mb-2">Grant Property Access</p>
                                <div className="space-y-1.5">
                                  {editOrg.properties.map((prop) => (
                                    <label key={prop.id} className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={existingUserPropertyIds.includes(prop.id)}
                                        onChange={(e) =>
                                          setExistingUserPropertyIds((prev) =>
                                            e.target.checked ? [...prev, prop.id] : prev.filter((id) => id !== prop.id)
                                          )
                                        }
                                        className="rounded border-gray-300 text-gold focus:ring-gold/30"
                                      />
                                      <span className="text-sm font-sans text-gray-700">{prop.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <Button
                                onClick={addExistingUserToOrg}
                                loading={addingUser}
                                disabled={!selectedExistingUserId}
                              >
                                Add to Organisation
                              </Button>
                              <Button variant="secondary" onClick={() => { setShowAddUser(false); setSelectedExistingUserId(null); setExistingUserPropertyIds([]); setExistingUserSearch(""); }}>
                                Cancel
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Members list */}
                    {editOrg.memberships.length === 0 ? (
                      <p className="text-sm text-gray-400 font-sans italic">No users in this organisation yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {(() => {
                          // Build a set of userIds who have property access in this org
                          const propertyAccessUserIds = new Set(
                            editOrg.properties.flatMap((p) => [
                              ...p.propertyAccess.map((a) => a.user.id),
                              ...(p.owner ? [p.owner.id] : []),
                            ])
                          );
                          return editOrg.memberships.map(({ user, role: memberRole, isBillingOwner }) => (
                          <div
                            key={user.id}
                            className="flex items-center gap-2.5 py-2.5 border-b border-gray-100 last:border-0"
                          >
                            {/* Avatar */}
                            <div className="w-7 h-7 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-sans font-medium text-gold">
                                {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                              </span>
                            </div>
                            {/* Name + email */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-sans text-header truncate">{user.name ?? "—"}</p>
                              <p className="text-xs text-gray-400 font-sans truncate">{user.email}</p>
                            </div>
                            {/* Badges */}
                            <Badge variant={roleBadge[memberRole] ?? "gray"}>{memberRole}</Badge>
                            {isBillingOwner && (
                              <span
                                className="flex items-center gap-1 text-xs font-sans text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0"
                                title="Billing owner"
                              >
                                <Crown size={10} /> Billing
                              </span>
                            )}
                            {!user.isActive && <Badge variant="red">Inactive</Badge>}
                            {/* Org-level ↔ property-level actions */}
                            {propertyAccessUserIds.has(user.id) ? (
                              <button
                                onClick={() => makeOrgLevel(editOrg.id, user.id)}
                                disabled={promotingOrgLevel === user.id}
                                className="text-gray-300 hover:text-blue-500 transition-colors disabled:opacity-50 shrink-0"
                                title="Make org-level (remove property access)"
                              >
                                {promotingOrgLevel === user.id
                                  ? <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-300 border-t-transparent animate-spin inline-block" />
                                  : <ArrowUp size={13} />}
                              </button>
                            ) : editOrg.properties.length > 0 ? (
                              <button
                                onClick={() => { setAssignPropertyOpen(user.id); setAssignPropertyIds([]); }}
                                className="text-gray-300 hover:text-green-600 transition-colors shrink-0"
                                title="Assign to a property"
                              >
                                <Home size={13} />
                              </button>
                            ) : null}
                            {/* Assign billing owner button (shown for non-owners only) */}
                            {!isBillingOwner && (
                              <button
                                onClick={() => assignBillingOwner(editOrg.id, user.id)}
                                disabled={assigningBillingOwner === user.id}
                                className="text-gray-300 hover:text-amber-500 transition-colors disabled:opacity-50 shrink-0"
                                title="Make billing owner"
                              >
                                {assigningBillingOwner === user.id ? (
                                  <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-300 border-t-transparent animate-spin inline-block" />
                                ) : (
                                  <Crown size={13} />
                                )}
                              </button>
                            )}
                            {/* Remove button */}
                            <button
                              onClick={() => removeFromOrg(editOrg.id, user.id)}
                              disabled={removingUser === user.id || isBillingOwner}
                              className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                              title={isBillingOwner ? "Transfer billing ownership before removing" : "Remove from organisation"}
                            >
                              {removingUser === user.id ? (
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-red-300 border-t-transparent animate-spin inline-block" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer — only shown on Details tab */}
              {editTab === "details" && (
                <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-gray-100 shrink-0">
                  <Button onClick={saveEdit} loading={saving} className="flex-1" disabled={!editForm.name}>
                    Save Changes
                  </Button>
                  <Button variant="secondary" onClick={() => setEditOrg(null)}>Cancel</Button>
                </div>
              )}
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
