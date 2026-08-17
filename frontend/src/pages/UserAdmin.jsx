import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Search, UserPlus, ShieldCheck, User2, X, Trash2 } from "lucide-react";

// BUGFIX (2026-08-16): `name` and a client-editable `password`/`password_confirmation` pair
// were never real. public.users has no `name` column (it's `full_name` -- see
// 0001_initial_schema.sql) and no `password` column at all (Supabase Auth owns credentials in
// auth.users, separate from this profile table). The old shape silently 400'd every save (see
// supabaseApiClient.js's PUT/PATCH handler for the write-side half of this fix) and, even once
// that's fixed, could never have actually reset another user's password -- there was no code
// path that could reach auth.users from here. Real password resets go through the existing
// self-service ForgotPassword.jsx email flow; this form no longer pretends otherwise.
const blank = { full_name: "", email: "", role: "technician", is_active: true };
const ROLE_LABELS = { admin: "Administrator", technician: "Technician", accountant: "Accountant", custom: "Custom" };
const FIELD_LABELS = { full_name: "Full Name", email: "Email" };

// Explains a permission's current state relative to its role default -- makes
// the matrix legible at a glance instead of requiring the admin to read text.
function permissionStateBadge(p) {
  if (p.effective === p.role_default) {
    return p.role_default
      ? { variant: "success", label: "Role default" }
      : { variant: "neutral", label: "Not included" };
  }
  return p.effective
    ? { variant: "info", label: "Added for this user" }
    : { variant: "warning", label: "Removed for this user" };
}

export default function UserAdmin() {
  const { user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(blank);
  const [matrix, setMatrix] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = () => Promise.all([apiClient.request("/admin/users"), apiClient.request("/roles/permissions")])
    .then(([u, r]) => { setUsers(u); setRoles(r); });

  useEffect(() => { load().catch((e) => setMessage(e.message)).finally(() => setLoading(false)); }, []);

  const edit = async (user) => {
    const result = await apiClient.request(`/users/${user.id}/permissions`);
    setSelected(user);
    setForm({ ...blank, ...user });
    setMatrix(result.permissions);
    setMessage("");
    setConfirmingDelete(false);
  };

  const roleChanged = (role) => {
    const defaults = new Set(roles[role]?.permissions || []);
    setForm({ ...form, role });
    setMatrix(matrix.map((p) => ({ ...p, effective: defaults.has(p.key), role_default: defaults.has(p.key), user_override: null })));
    setMessage("The selected role has populated the recommended permissions. You may customise these permissions for this user.");
  };

  const grouped = useMemo(() => Object.groupBy(
    matrix.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())),
    (p) => p.group
  ), [matrix, search]);

  const enabled = matrix.filter((p) => p.effective).length;
  const overrides = matrix.filter((p) => p.effective !== p.role_default).length;

  // Edit-only: account creation is self-service (see startNew() below), so `selected` is
  // always set by the time this form can be submitted.
  const save = async (event) => {
    event.preventDefault();
    if (saving || !selected) return;
    setMessage(""); setFieldErrors({}); setSaving(true);
    try {
      const permissions = Object.fromEntries(matrix.map((p) => [p.key, p.effective]));
      const body = { ...form, permissions };
      await apiClient.request(`/users/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await load();
      setSelected(null); setMatrix([]); setForm(blank);
      setMessage("User and permissions saved.");
    } catch (error) {
      setFieldErrors(error.errors || {});
      setMessage(error.message || "Unable to save the user.");
    } finally {
      setSaving(false);
    }
  };

  // BUGFIX (2026-08-16): this used to populate a blank create form that saved via POST /users,
  // i.e. a plain insert into public.users. That was never functional: public.users.id is a
  // foreign key to auth.users(id) (0001_initial_schema.sql), auto-populated by a trigger when
  // someone actually signs up through Supabase Auth -- there is no client-safe way to create a
  // real auth account (and therefore a valid public.users row) from here without a service_role
  // key, which frontend code must never hold. New accounts are created via self-service sign-up
  // (Register.jsx, made real 2026-08-17 -- it used to call apiClient.auth methods that never
  // existed); an admin's role here is to select that person afterward and configure their
  // role/permissions, not to originate the account.
  //
  // UPDATE (2026-08-17): opens Register.jsx in a NEW TAB rather than navigating this tab away.
  // register() (SupabaseAuthContext.jsx) calls supabase.auth.signUp(), which -- if this
  // Supabase project ever has "Confirm email" turned off -- returns an immediate session and
  // would silently replace whatever session is currently active in that browser tab. An admin
  // clicking this while signed in here must not risk losing their own session; a new tab
  // isolates that risk entirely (browser tabs don't share supabase-js's in-memory session
  // unless using the exact same storage, and even then the admin's own tab stays on their own
  // page, unaffected by what happens in the other tab).
  const startNew = () => {
    setSelected(null); setMatrix([]); setForm(blank);
    window.open("/register", "_blank", "noopener,noreferrer");
    setMessage("Opened the registration page in a new tab. Have the new person fill it in (or fill it in for them there) -- once they've registered and confirmed their email, select their name from the list on the left to assign a role and permissions.");
  };

  const cancel = () => { setSelected(null); setMatrix([]); setMessage(""); setConfirmingDelete(false); };

  // NEW (2026-08-17, requested): admins can now remove a user's public.users profile row.
  // `users_delete_admin` (0002_rls_policies.sql) already gates this server-side to
  // `public.is_admin()` -- the same RLS-only pattern this project prefers over a new
  // server-side service (see CLAUDE.md section 6.4). Gated here by `hasPermission("users.delete")`
  // for consistency with "users.create" above; that key isn't in the permissions catalog (same
  // as "users.create"/"users.view"), so in practice only admins see this via the `role ===
  // "admin"` bypass in `hasPermission()`, matching the RLS policy's own admin-only scope exactly.
  //
  // DISCLOSED LIMITATION: this deletes the public.users PROFILE row only, not the underlying
  // Supabase Auth account (auth.users) -- public.users.id is a foreign key referencing
  // auth.users(id), the opposite direction of a cascade, so deleting the profile can never
  // remove the login credential itself. A client can never do that safely (it requires the
  // service_role key, which must never be shipped to frontend code). In practice this fully
  // disables the account within the app -- `has_active_profile()` and every permission check
  // depend on the public.users row existing, so a deleted user immediately loses all access --
  // but the person could still complete a bare Supabase Auth sign-in with no profile/permissions
  // afterward. A true "delete the login too" action would need a dedicated Supabase Edge
  // Function (the one case CLAUDE.md's policy allows a new server-side service for), which does
  // not exist in this project yet and was not built here without a separate explicit decision.
  const removeUser = async () => {
    if (!selected || deleting) return;
    if (currentUser?.id === selected.id) {
      setMessage("You cannot delete your own account from here.");
      return;
    }
    setDeleting(true); setMessage("");
    try {
      await apiClient.request(`/users/${selected.id}`, { method: "DELETE" });
      await load();
      setSelected(null); setMatrix([]); setForm(blank); setConfirmingDelete(false);
      setMessage(`${selected.full_name || selected.email}'s profile and access were removed. Their Supabase Auth login record itself was not deleted (not possible from client-side code) -- they can no longer sign in with any effect, since every permission check requires this profile row.`);
    } catch (error) {
      setMessage(error.message || "Unable to delete this user.");
    } finally {
      setDeleting(false);
    }
  };

  const showEditor = selected || matrix.length > 0;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="User Management"
        subtitle="Configure individual access without changing role defaults."
        action={hasPermission("users.create") && (
          <Button onClick={startNew} variant="outline" className="gap-2"><UserPlus className="w-4 h-4" /> New user?</Button>
        )}
      />

      {message && (
        <div className="border border-border bg-secondary/50 rounded-lg px-4 py-2.5 text-sm text-foreground mb-5">
          {message}
        </div>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        {/* User list */}
        <div className="bg-card border border-border rounded-xl p-2">
          {loading ? (
            <div className="p-2 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={User2} title="No users yet" description="New accounts appear here once someone registers at the Register page." />
          ) : (
            <div className="space-y-1">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => edit(user)}
                  className={`w-full text-left rounded-lg p-3 transition-colors duration-150 ${
                    selected?.id === user.id ? "bg-primary/10" : "hover:bg-secondary"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground truncate">{user.full_name || user.email}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Badge variant="neutral">{ROLE_LABELS[user.role] || user.role}</Badge>
                    <Badge variant={user.is_active ? "success" : "neutral"}>{user.is_active ? "Active" : "Disabled"}</Badge>
                    <span className="text-xs text-muted-foreground">{user.effective_permission_count} permissions</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editor */}
        {!showEditor ? (
          <div className="bg-card border border-dashed border-border rounded-xl">
            <EmptyState icon={ShieldCheck} title="Select a user" description="Choose a user from the list to view or edit their role and permissions." />
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-heading font-semibold text-foreground text-sm mb-4">
                Account Details
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {Object.keys(FIELD_LABELS).map((key) => (
                  <div key={key}>
                    <Label>{FIELD_LABELS[key]}</Label>
                    <Input
                      type="text"
                      value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      required
                      className="mt-1.5 h-10"
                    />
                    {fieldErrors[key]?.map((error) => <p key={error} className="mt-1 text-xs text-destructive">{error}</p>)}
                  </div>
                ))}
                <div>
                  <Label>Primary Role</Label>
                  <Select value={form.role} onValueChange={roleChanged}>
                    <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(ROLE_LABELS).map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
                    <span className="text-sm text-foreground">Active account</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="font-heading font-semibold text-foreground text-sm">Permissions</h2>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search permissions…" className="pl-9 h-9 text-sm" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-5">
                <Button type="button" variant="outline" size="sm" onClick={() => setMatrix(matrix.map((p) => ({ ...p, effective: true })))}>Select all</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setMatrix(matrix.map((p) => ({ ...p, effective: false })))}>Clear all</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setMatrix(matrix.map((p) => ({ ...p, effective: p.role_default })))}>Reset to role defaults</Button>
              </div>

              <div className="space-y-4">
                {Object.entries(grouped).map(([group, items]) => {
                  const allSelected = items.every((p) => p.effective);
                  return (
                    <section key={group} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-foreground text-sm">{group}</h3>
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => {
                            const keys = new Set(items.map((p) => p.key));
                            setMatrix(matrix.map((p) => (keys.has(p.key) ? { ...p, effective: !allSelected } : p)));
                          }}
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div className="grid md:grid-cols-2 gap-2">
                        {items.map((p) => {
                          const state = permissionStateBadge(p);
                          return (
                            <label key={p.key} className="flex items-start gap-2.5 border border-border rounded-lg p-2.5 hover:bg-secondary/40 transition-colors duration-150 cursor-pointer">
                              <Checkbox
                                className="mt-0.5"
                                checked={p.effective}
                                onCheckedChange={(v) => setMatrix(matrix.map((item) => (item.key === p.key ? { ...item, effective: !!v } : item)))}
                              />
                              <span className="min-w-0">
                                <span className="text-sm font-medium text-foreground block">{p.name}</span>
                                <Badge variant={state.variant} className="mt-1 text-[10px] px-1.5 py-0">{state.label}</Badge>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {fieldErrors.permissions?.map((error) => <p key={error} className="text-sm text-destructive mt-3">{error}</p>)}
            </div>

            <div className="sticky bottom-4 bg-card border border-border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{enabled}</span> enabled &middot; {enabled - overrides} inherited &middot; {overrides} customised
              </p>
              <div className="flex flex-wrap gap-2 shrink-0">
                {hasPermission("users.delete") && selected && currentUser?.id !== selected.id && (
                  confirmingDelete ? (
                    <div className="flex items-center gap-2 border border-destructive/40 bg-destructive/5 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs text-destructive font-medium">Delete {selected.full_name || selected.email}?</span>
                      <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={removeUser} className="gap-1.5 h-7">
                        {deleting ? "Deleting…" : "Confirm"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => setConfirmingDelete(false)} className="h-7">
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" disabled={saving || deleting} onClick={() => setConfirmingDelete(true)} className="gap-1.5 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" /> Delete User
                    </Button>
                  )
                )}
                <Button type="button" variant="outline" disabled={saving} onClick={cancel} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
                <Button disabled={saving} className="gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
