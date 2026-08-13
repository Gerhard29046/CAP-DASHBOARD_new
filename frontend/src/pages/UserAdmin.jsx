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
import { Plus, Search, UserPlus, ShieldCheck, User2, X } from "lucide-react";

const blank = { name: "", email: "", password: "", password_confirmation: "", role: "technician", is_active: true };
const ROLE_LABELS = { admin: "Administrator", technician: "Technician", accountant: "Accountant", custom: "Custom" };
const FIELD_LABELS = { name: "Name", email: "Email", password: "Password", password_confirmation: "Password Confirmation" };

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
  const { hasPermission } = useAuth();
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

  const load = () => Promise.all([apiClient.request("/admin/users"), apiClient.request("/roles/permissions")])
    .then(([u, r]) => { setUsers(u); setRoles(r); });

  useEffect(() => { load().catch((e) => setMessage(e.message)).finally(() => setLoading(false)); }, []);

  const edit = async (user) => {
    const result = await apiClient.request(`/users/${user.id}/permissions`);
    setSelected(user);
    setForm({ ...blank, ...user, password: "", password_confirmation: "" });
    setMatrix(result.permissions);
    setMessage("");
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

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setMessage(""); setFieldErrors({}); setSaving(true);
    try {
      const permissions = Object.fromEntries(matrix.map((p) => [p.key, p.effective]));
      const body = { ...form, permissions };
      if (selected && !body.password) { delete body.password; delete body.password_confirmation; }
      await apiClient.request(selected ? `/users/${selected.id}` : "/users", {
        method: selected ? "PUT" : "POST",
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

  const startNew = () => {
    setSelected(null); setForm(blank); setMessage("");
    const defaults = new Set(roles.technician?.permissions || []);
    apiClient.request("/permissions").then((groups) => setMatrix(
      Object.values(groups).flat().map((p) => ({ ...p, role_default: defaults.has(p.key), effective: defaults.has(p.key), user_override: null }))
    ));
  };

  const cancel = () => { setSelected(null); setMatrix([]); setMessage(""); };

  const showEditor = selected || matrix.length > 0;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="User Management"
        subtitle="Configure individual access without changing role defaults."
        action={hasPermission("users.create") && (
          <Button onClick={startNew} className="gap-2"><UserPlus className="w-4 h-4" /> Create User</Button>
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
            <EmptyState icon={User2} title="No users yet" description="Create the first user account." />
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
                  <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
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
            <EmptyState icon={ShieldCheck} title="Select a user" description="Choose a user from the list to view or edit their access, or create a new one." />
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-heading font-semibold text-foreground text-sm mb-4">
                {selected ? "Account Details" : "New User"}
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {Object.keys(FIELD_LABELS).map((key) => (
                  <div key={key}>
                    <Label>{FIELD_LABELS[key]}</Label>
                    <Input
                      type={key.includes("password") ? "password" : "text"}
                      autoComplete={key.includes("password") ? "new-password" : undefined}
                      value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      required={!selected}
                      className="mt-1.5 h-10"
                    />
                    {key === "password" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selected ? "Leave blank to keep the current password. " : ""}
                        8+ characters with uppercase, lowercase, a number, and a symbol.
                      </p>
                    )}
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
              <div className="flex gap-2 shrink-0">
                <Button type="button" variant="outline" disabled={saving} onClick={cancel} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
                <Button disabled={saving} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save User"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
