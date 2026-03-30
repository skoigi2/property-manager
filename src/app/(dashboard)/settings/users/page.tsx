"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { UserCog, Plus, Check, X, KeyRound, Building2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

interface PropertyInfo { id: string; name: string; }
interface OrgInfo { id: string; name: string; }
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

export default function UsersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const isSuperAdmin = isAdmin && (session?.user as any)?.organizationId === null;

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

  useEffect(() => { load(); loadOrgs(); }, [isSuperAdmin]);

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
        <Button size="sm" onClick={() => { reset({ role: "MANAGER", propertyIds: [] }); setModalOpen(true); }}>
          <Plus size={14} className="mr-1" /> Add User
        </Button>
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
                      {isSuperAdmin && (
                        <p className="text-xs text-gray-400 font-sans flex items-center gap-1 mt-0.5">
                          <Building2 size={10} />
                          {user.organization?.name ?? <span className="italic">Super-admin</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Full Name *</label>
              <input className="form-input" {...register("name")} placeholder="Jane Doe" />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="form-input" {...register("phone")} placeholder="+254 7..." />
            </div>
          </div>

          <div>
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" {...register("email")} placeholder="user@example.com" />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          {isSuperAdmin && (
            <div>
              <label className="form-label">Organisation</label>
              <select className="form-input" {...register("organizationId")}>
                <option value="">— None (super-admin) —</option>
                {allOrgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              {allOrgs.length === 0 && (
                <p className="text-xs text-gray-400 font-sans mt-1">
                  No organisations yet.{" "}
                  <Link href="/admin/organizations" className="text-gold underline underline-offset-2">Create one first →</Link>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Role *</label>
              <select className="form-input" {...register("role")}>
                {isSuperAdmin && <option value="ADMIN">Admin</option>}
                <option value="MANAGER">Manager</option>
                <option value="ACCOUNTANT">Accountant</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
            <div>
              <label className="form-label">Password *</label>
              <div className="relative">
                <input type="password" className="form-input pr-8" {...register("password")} placeholder="Min 6 chars" />
                <KeyRound size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
              </div>
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>
          </div>

          {/* Property access for non-owners and non-admins */}
          {selectedRole !== "OWNER" && selectedRole !== "ADMIN" && allProps.length > 0 && (
            <div>
              <label className="form-label">Property Access</label>
              <div className="space-y-2 mt-1">
                {allProps.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm font-sans text-header cursor-pointer">
                    <input
                      type="checkbox"
                      value={p.id}
                      className="rounded accent-gold"
                      {...register("propertyIds")}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Create User</Button>
          </div>
        </form>
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

            <div>
              <label className="form-label">New Password *</label>
              <div className="relative">
                <input
                  type="password"
                  className="form-input pr-8"
                  {...registerReset("password")}
                  placeholder="Min 6 characters"
                />
                <KeyRound size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
              </div>
              {resetErrors.password && <p className="form-error">{resetErrors.password.message}</p>}
            </div>

            <div>
              <label className="form-label">Confirm Password *</label>
              <input
                type="password"
                className="form-input"
                {...registerReset("confirmPassword")}
                placeholder="Repeat password"
              />
              {resetErrors.confirmPassword && <p className="form-error">{resetErrors.confirmPassword.message}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setResetTarget(null); resetResetForm(); }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={resetting}>Update Password</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
