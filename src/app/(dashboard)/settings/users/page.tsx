"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { UserCog, Plus, Check, X, KeyRound, Building2, ExternalLink, Pencil, Mail, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

interface PropertyInfo { id: string; name: string; }
interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  token: string;
  invitedBy: { name: string | null; email: string | null };
}
interface OrgInfo {
  id: string;
  name: string;
  pricingTier: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  freeAccess: boolean;
}
interface UserItem {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  organizationId: string | null;
  organization: OrgInfo | null;
  propertyAccess: { property: PropertyInfo }[];
  ownedProperties: PropertyInfo[];
}

const createSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Min 6 characters"),
  role: z.enum(["ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"]),
  phone: z.string().optional(),
  propertyIds: z.array(z.string()).optional(),
  organizationId: z.string().optional().nullable(),
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(1, "Name required"),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "OWNER", "MANAGER", "ACCOUNTANT"]),
});
type EditForm = z.infer<typeof editSchema>;

const resetSchema = z.object({
  password: z.string().min(6, "Min 6 characters"),
  confirmPassword: z.string().min(6, "Min 6 characters"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type ResetForm = z.infer<typeof resetSchema>;

const roleBadge: Record<string, "green" | "blue" | "amber" | "gold"> = {
  ADMIN: "gold",
  MANAGER: "green",
  OWNER: "blue",
  ACCOUNTANT: "amber",
};

function orgSubscriptionBadge(org: OrgInfo | null): { label: string; variant: "green" | "amber" | "red" | "blue" | "gold" | "gray" } | null {
  if (!org) return null;
  if (org.freeAccess) return { label: "Free Access", variant: "gold" };
  if (org.pricingTier !== "TRIAL") {
    if (org.subscriptionStatus === "active") return { label: org.pricingTier, variant: "green" };
    if (org.subscriptionStatus === "past_due") return { label: "Past Due", variant: "amber" };
    if (org.subscriptionStatus === "canceled") return { label: "Canceled", variant: "red" };
    return { label: org.pricingTier, variant: "gray" };
  }
  // TRIAL
  const daysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  if (daysLeft > 0) return { label: `Trial · ${daysLeft}d`, variant: "blue" };
  return { label: "Trial Expired", variant: "red" };
}

export default function UsersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  // Super-admin: role=ADMIN with no organizationId. Treat undefined/empty string same as null.
  const sessionOrgId = (session?.user as any)?.organizationId;
  const isSuperAdmin = isAdmin && (sessionOrgId === null || sessionOrgId === undefined || sessionOrgId === "");

  const [users, setUsers] = useState<UserItem[]>([]);
  const [allProps, setAllProps] = useState<PropertyInfo[]>([]);
  const [allOrgs, setAllOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState<string | null>(null);

  // Reset password state
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [resetting, setResetting] = useState(false);

  // Edit user state
  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Invite state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MANAGER" | "ACCOUNTANT" | "OWNER">("MANAGER");
  const [inviting, setInviting] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "MANAGER", propertyIds: [] },
  });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    reset: resetResetForm,
    formState: { errors: resetErrors },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEditForm,
    formState: { errors: editErrors },
  } = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const selectedRole = watch("role");

  const load = async () => {
    const [u, p] = await Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/properties").then((r) => r.json()),
    ]);
    setUsers(u);
    setAllProps(p);
    setLoading(false);
  };

  const loadOrgs = async () => {
    if (!isSuperAdmin) return;
    const res = await fetch("/api/organizations");
    if (res.ok) setAllOrgs(await res.json());
  };

  const loadInvites = async () => {
    if (!isAdmin) return;
    const res = await fetch("/api/invitations");
    if (res.ok) setPendingInvites(await res.json());
  };

  useEffect(() => { load(); loadOrgs(); loadInvites(); }, [isSuperAdmin]);

  const sendInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to send invitation");
      }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("MANAGER");
      loadInvites();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send invitation");
    } finally { setInviting(false); }
  };

  const revokeInvite = async (token: string) => {
    setRevoking(token);
    try {
      const res = await fetch(`/api/invitations/${token}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to revoke invitation");
      }
      toast.success("Invitation revoked");
      setPendingInvites((prev) => prev.filter((i) => i.token !== token));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke");
    } finally { setRevoking(null); }
  };

  const onSubmit = async (values: CreateForm) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      toast.success("User created");
      setModalOpen(false);
      reset();
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const onEditSubmit = async (values: EditForm) => {
    if (!editTarget) return;
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("User updated");
      setEditTarget(null);
      load();
    } catch {
      toast.error("Failed to update user");
    } finally {
      setEditSubmitting(false);
    }
  };

  const onResetPassword = async (values: ResetForm) => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: values.password }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
      toast.success(`Password updated for ${resetTarget.name ?? resetTarget.email}`);
      setResetTarget(null);
      resetResetForm();
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const toggleAccess = async (userId: string, propertyId: string, currentGrant: boolean) => {
    const key = `${userId}-${propertyId}`;
    setTogglingAccess(key);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, grant: !currentGrant }),
      });
      if (!res.ok) throw new Error();
      // Optimistically update
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          if (!currentGrant) {
            return { ...u, propertyAccess: [...u.propertyAccess, { property: allProps.find((p) => p.id === propertyId)! }] };
          } else {
            return { ...u, propertyAccess: u.propertyAccess.filter((a) => a.property.id !== propertyId) };
          }
        })
      );
    } catch {
      toast.error("Failed to update access");
    } finally {
      setTogglingAccess(null);
    }
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !isActive } : u));
      toast.success(isActive ? "User deactivated" : "User activated");
    } catch {
      toast.error("Failed to update user");
    }
  };

  return (
    <div>
      <Header
        title="Users"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      >
        <div className="flex items-center gap-2">
          {isAdmin && !isSuperAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
              <Mail size={14} className="mr-1" /> Invite
            </Button>
          )}
          <Button size="sm" onClick={() => { reset({ role: "MANAGER", propertyIds: [] }); setModalOpen(true); }}>
            <Plus size={14} className="mr-1" /> Add User
          </Button>
        </div>
      </Header>

      <div className="page-container space-y-4">
        {isSuperAdmin && (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-xs font-sans text-amber-700 flex items-center gap-1.5">
              <Building2 size={13} />
              You are viewing users across all organisations.
            </p>
            <Link href="/admin/organizations" className="flex items-center gap-1 text-xs font-sans text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2 transition-colors">
              Manage Organisations <ExternalLink size={11} />
            </Link>
          </div>
        )}

        {/* Pending invitations */}
        {isAdmin && !isSuperAdmin && pendingInvites.length > 0 && (
          <Card>
            <p className="text-xs font-sans font-medium text-gray-400 uppercase tracking-wide mb-3">
              Pending Invitations ({pendingInvites.length})
            </p>
            <div className="space-y-2">
              {pendingInvites.map((inv) => {
                const expiresAt = new Date(inv.expiresAt);
                const hoursLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000));
                return (
                  <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail size={13} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-sans text-header truncate">{inv.email}</p>
                      <p className="text-xs text-gray-400 font-sans flex items-center gap-1">
                        <Clock size={10} /> Expires in {hoursLeft}h · invited as {inv.role}
                      </p>
                    </div>
                    <Badge variant={roleBadge[inv.role] ?? "gray"}>{inv.role}</Badge>
                    <button
                      onClick={() => revokeInvite(inv.token)}
                      disabled={revoking === inv.token}
                      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                      title="Revoke invitation"
                    >
                      {revoking === inv.token ? (
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-red-300 border-t-transparent animate-spin inline-block" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
        ) : (
          users.map((user) => {
            const grantedIds = new Set(user.propertyAccess.map((a) => a.property.id));
            const canModify = session?.user?.id !== user.id;
            // Super-admin users can only be modified by other super-admins
            const userIsSuperAdmin = user.role === "ADMIN" && user.organizationId === null;
            // MANAGER cannot touch ADMIN users; org-admin cannot touch super-admin users
            const canEdit = (isAdmin || user.role !== "ADMIN") && (!userIsSuperAdmin || isSuperAdmin);

            return (
              <Card key={user.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                      <UserCog size={18} className="text-gold" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-header font-sans text-sm">{user.name ?? "—"}</p>
                        <Badge variant={roleBadge[user.role] ?? "gray"}>{user.role}</Badge>
                        {!user.isActive && <Badge variant="red">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 font-sans">{user.email}</p>
                      {user.phone && <p className="text-xs text-gray-400 font-sans">{user.phone}</p>}
                      {isAdmin && (
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {isSuperAdmin && (
                            <p className="text-xs text-gray-400 font-sans flex items-center gap-1">
                              <Building2 size={10} />
                              {user.organization?.name ?? <span className="italic">Super-admin</span>}
                            </p>
                          )}
                          {(() => {
                            const sub = orgSubscriptionBadge(user.organization);
                            return sub ? <Badge variant={sub.variant}>{sub.label}</Badge> : null;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Edit user details */}
                    {canModify && canEdit && (
                      <button
                        onClick={() => {
                          setEditTarget(user);
                          resetEditForm({ name: user.name ?? "", phone: user.phone ?? "", role: user.role as EditForm["role"] });
                        }}
                        className="flex items-center gap-1 text-xs font-sans text-gray-400 hover:text-gold transition-colors"
                        title="Edit user"
                      >
                        <Pencil size={13} />
                        <span>Edit</span>
                      </button>
                    )}

                    {/* Reset password — ADMIN only, not self, not super-admin target */}
                    {isAdmin && canModify && canEdit && (
                      <button
                        onClick={() => { setResetTarget(user); resetResetForm(); }}
                        className="flex items-center gap-1 text-xs font-sans text-gray-400 hover:text-gold transition-colors"
                        title="Reset password"
                      >
                        <KeyRound size={13} />
                        <span>Reset pwd</span>
                      </button>
                    )}

                    {/* Activate/deactivate */}
                    {canModify && canEdit && (
                      <button
                        onClick={() => toggleActive(user.id, user.isActive)}
                        className="text-xs font-sans text-gray-400 hover:text-header underline underline-offset-2 transition-colors"
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Property access (not for OWNER — they're linked via ownerId) */}
                {user.role !== "OWNER" && user.role !== "ADMIN" && allProps.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-400 font-sans font-medium uppercase tracking-wide mb-2">Property Access</p>
                    <div className="space-y-1.5">
                      {allProps.map((prop) => {
                        const hasAccess = grantedIds.has(prop.id);
                        const key = `${user.id}-${prop.id}`;
                        const busy = togglingAccess === key;
                        return (
                          <div key={prop.id} className="flex items-center justify-between">
                            <span className="text-sm font-sans text-gray-600">{prop.name}</span>
                            <button
                              onClick={() => toggleAccess(user.id, prop.id, hasAccess)}
                              disabled={busy || !canEdit}
                              className={`flex items-center gap-1.5 text-xs font-sans px-2.5 py-1 rounded-lg transition-colors ${
                                hasAccess
                                  ? "bg-green-50 text-income hover:bg-red-50 hover:text-expense"
                                  : "bg-gray-50 text-gray-400 hover:bg-green-50 hover:text-income"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {busy ? (
                                <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                              ) : hasAccess ? (
                                <Check size={12} />
                              ) : (
                                <X size={12} />
                              )}
                              {hasAccess ? "Granted" : "No access"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ADMIN note */}
                {user.role === "ADMIN" && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-400 font-sans italic">Full access to all properties and settings</p>
                  </div>
                )}

                {/* For OWNERs show their owned properties */}
                {user.role === "OWNER" && user.ownedProperties.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <p className="text-xs text-gray-400 font-sans font-medium uppercase tracking-wide mb-1.5">Owns</p>
                    <div className="flex flex-wrap gap-1.5">
                      {user.ownedProperties.map((p) => (
                        <Badge key={p.id} variant="blue">{p.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Create user modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add User">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name *" {...register("name")} error={errors.name?.message} placeholder="Jane Doe" />
            <Input label="Phone" {...register("phone")} placeholder="+1 555 000 0000" />
          </div>

          <Input label="Email *" type="email" {...register("email")} error={errors.email?.message} placeholder="user@example.com" />

          {isSuperAdmin && (
            <div>
              <Select
                label="Organisation"
                {...register("organizationId")}
                placeholder="— None (super-admin) —"
                options={allOrgs.map((org) => ({ value: org.id, label: org.name }))}
              />
              {allOrgs.length === 0 && (
                <p className="text-xs text-gray-400 font-sans mt-1">
                  No organisations yet.{" "}
                  <Link href="/admin/organizations" className="text-gold underline underline-offset-2">Create one first →</Link>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Role *"
              {...register("role")}
              options={[
                ...(isAdmin ? [{ value: "ADMIN", label: "Admin" }] : []),
                { value: "MANAGER", label: "Manager" },
                { value: "ACCOUNTANT", label: "Accountant" },
                { value: "OWNER", label: "Owner" },
              ]}
            />
            <Input label="Password *" type="password" {...register("password")} error={errors.password?.message} placeholder="Min 6 chars" />
          </div>

          {/* Property access for non-owners and non-admins */}
          {selectedRole !== "OWNER" && selectedRole !== "ADMIN" && allProps.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-600 font-sans mb-1.5">Property Access</p>
              <div className="space-y-2">
                {allProps.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm font-sans text-header cursor-pointer">
                    <input type="checkbox" value={p.id} className="rounded accent-gold" {...register("propertyIds")} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={submitting}>Create User</Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        open={!!editTarget}
        onClose={() => { setEditTarget(null); }}
        title="Edit User"
      >
        {editTarget && (
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <p className="text-sm font-sans text-gray-500">
              Editing <span className="font-medium text-header">{editTarget.email}</span>
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name *" {...registerEdit("name")} error={editErrors.name?.message} placeholder="Jane Doe" />
              <Input label="Phone" {...registerEdit("phone")} placeholder="+1 555 000 0000" />
            </div>

            <Select
              label="Role *"
              {...registerEdit("role")}
              options={[
                ...(isAdmin ? [{ value: "ADMIN", label: "Admin" }] : []),
                { value: "MANAGER", label: "Manager" },
                { value: "ACCOUNTANT", label: "Accountant" },
                { value: "OWNER", label: "Owner" },
              ]}
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={editSubmitting}>Save Changes</Button>
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Invite user modal */}
      <Modal open={inviteOpen} onClose={() => { setInviteOpen(false); setInviteEmail(""); setInviteRole("MANAGER"); }} title="Invite Team Member">
        <div className="space-y-4">
          <p className="text-sm font-sans text-gray-500">
            An invitation link valid for 48 hours will be emailed to them.
          </p>
          <Input
            label="Email address *"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@example.com"
          />
          <div>
            <label className="block text-xs font-sans text-gray-500 mb-1">Role *</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-sans text-gray-700 focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white"
            >
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={sendInvite} loading={inviting} disabled={!inviteEmail}>
              <Mail size={14} className="mr-1" /> Send Invitation
            </Button>
            <Button variant="secondary" onClick={() => { setInviteOpen(false); setInviteEmail(""); setInviteRole("MANAGER"); }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={!!resetTarget}
        onClose={() => { setResetTarget(null); resetResetForm(); }}
        title="Reset Password"
      >
        {resetTarget && (
          <form onSubmit={handleSubmitReset(onResetPassword)} className="space-y-4">
            <p className="text-sm font-sans text-gray-500">
              Set a new password for <span className="font-medium text-header">{resetTarget.name ?? resetTarget.email}</span>.
            </p>

            <Input
              label="New Password *"
              type="password"
              {...registerReset("password")}
              error={resetErrors.password?.message}
              placeholder="Min 6 characters"
            />

            <Input
              label="Confirm Password *"
              type="password"
              {...registerReset("confirmPassword")}
              error={resetErrors.confirmPassword?.message}
              placeholder="Repeat password"
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={resetting}>Update Password</Button>
              <Button type="button" variant="secondary" onClick={() => { setResetTarget(null); resetResetForm(); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
