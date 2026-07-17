import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const blank = { name: "", email: "", password: "", password_confirmation: "", role: "technician", is_active: true };
const ROLE_LABELS = { admin: "Administrator", technician: "Technician", accountant: "Accountant", custom: "Custom" };
const FIELD_LABELS = { name: "Name", email: "Email", password: "Password", password_confirmation: "Password Confirmation" };

export default function UserAdmin() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState([]), [roles, setRoles] = useState({}), [selected, setSelected] = useState(null);
  const [form, setForm] = useState(blank), [matrix, setMatrix] = useState([]), [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const load = () => Promise.all([apiClient.request("/admin/users"), apiClient.request("/roles/permissions")]).then(([u, r]) => { setUsers(u); setRoles(r); });
  useEffect(() => { load().catch((e) => setMessage(e.message)); }, []);

  const edit = async (user) => {
    const result = await apiClient.request(`/users/${user.id}/permissions`);
    setSelected(user); setForm({ ...blank, ...user, password: "", password_confirmation: "" }); setMatrix(result.permissions);
  };
  const roleChanged = (role) => {
    const defaults = new Set(roles[role]?.permissions || []);
    setForm({ ...form, role });
    setMatrix(matrix.map((p) => ({ ...p, effective: defaults.has(p.key), role_default: defaults.has(p.key), user_override: null })));
    setMessage("The selected role has populated the recommended permissions. You may customise these permissions for this user.");
  };
  const grouped = useMemo(() => Object.groupBy(matrix.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())), (p) => p.group), [matrix, search]);
  const enabled = matrix.filter((p) => p.effective).length;
  const overrides = matrix.filter((p) => p.effective !== p.role_default).length;
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setMessage(""); setFieldErrors({}); setSaving(true);
    try {
      const permissions = Object.fromEntries(matrix.map((permission) => [permission.key, permission.effective]));
      const body = { ...form, permissions };
      if (selected && !body.password) { delete body.password; delete body.password_confirmation; }
      await apiClient.request(selected ? `/users/${selected.id}` : "/users", { method: selected ? "PUT" : "POST", body: JSON.stringify(body) });
      await load(); setSelected(null); setMatrix([]); setForm(blank); setMessage("User and permissions saved.");
    } catch (error) {
      setFieldErrors(error.errors || {}); setMessage(error.message || "Unable to save the user.");
    } finally { setSaving(false); }
  };
  const startNew = () => {
    setSelected(null); setForm(blank);
    const defaults = new Set(roles.technician?.permissions || []);
    apiClient.request("/permissions").then((groups) => setMatrix(Object.values(groups).flat().map((p) => ({ ...p, role_default: defaults.has(p.key), effective: defaults.has(p.key), user_override: null }))));
  };

  return <div className="max-w-6xl mx-auto space-y-5">
    <div className="flex justify-between"><div><h1 className="text-2xl font-bold">User Management</h1><p className="text-muted-foreground text-sm">Configure individual access without changing role defaults.</p></div>{hasPermission("users.create") && <Button onClick={startNew}>Create User</Button>}</div>
    {message && <div className="border rounded-xl p-3 text-sm">{message}</div>}
    <div className="grid lg:grid-cols-[300px_1fr] gap-5">
      <div className="bg-card border rounded-2xl p-4 space-y-2">{users.map((user) => <button key={user.id} onClick={() => edit(user)} className="w-full text-left bg-secondary/40 rounded-xl p-3"><b>{user.name}</b><p className="text-xs text-muted-foreground">{user.email}</p><p className="text-xs">{ROLE_LABELS[user.role] || user.role} · {user.is_active ? "Active" : "Disabled"} · {user.effective_permission_count} permissions</p></button>)}</div>
      {(selected || matrix.length > 0) && <form onSubmit={save} className="space-y-4">
        <div className="bg-card border rounded-2xl p-5 grid md:grid-cols-2 gap-3">
          {Object.keys(FIELD_LABELS).map((key) => <div key={key}><Label>{FIELD_LABELS[key]}</Label><Input type={key.includes("password") ? "password" : "text"} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={!selected && Object.keys(FIELD_LABELS).includes(key)} />{fieldErrors[key]?.map((error) => <p key={error} className="mt-1 text-xs text-destructive">{error}</p>)}</div>)}
          <div><Label>Primary Role</Label><Select value={form.role} onValueChange={roleChanged}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(ROLE_LABELS).map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent></Select></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active Account</label>
        </div>
        <Input placeholder="Search permissions" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setMatrix(matrix.map((p) => ({ ...p, effective: true })))}>Select all</Button><Button type="button" variant="outline" onClick={() => setMatrix(matrix.map((p) => ({ ...p, effective: false })))}>Clear all</Button><Button type="button" variant="outline" onClick={() => setMatrix(matrix.map((p) => ({ ...p, effective: p.role_default })))}>Reset to role defaults</Button></div>
        {Object.entries(grouped).map(([group, items]) => <section key={group} className="bg-card border rounded-2xl p-4"><div className="flex justify-between"><h2 className="font-bold">{group}</h2><button type="button" className="text-xs text-primary" onClick={() => { const keys = new Set(items.map((p) => p.key)); const all = items.every((p) => p.effective); setMatrix(matrix.map((p) => keys.has(p.key) ? { ...p, effective: !all } : p)); }}>Select group</button></div><div className="grid md:grid-cols-2 gap-2 mt-3">{items.map((p) => <label key={p.key} className="flex gap-2 border rounded-lg p-2"><input type="checkbox" checked={p.effective} onChange={(e) => setMatrix(matrix.map((item) => item.key === p.key ? { ...item, effective: e.target.checked } : item))} /><span><b className="text-sm">{p.name}</b><small className="block text-muted-foreground">{p.effective === p.role_default ? (p.role_default ? "Granted by role" : "Denied by role") : (p.effective ? "Explicitly granted" : "Explicitly denied")}</small></span></label>)}</div></section>)}
        {fieldErrors.permissions?.map((error) => <p key={error} className="text-sm text-destructive">{error}</p>)}
        <div className="sticky bottom-2 bg-card border rounded-xl p-3 flex justify-between items-center"><p className="text-sm">{enabled} enabled · {enabled - overrides} inherited · {overrides} customised</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => { setSelected(null); setMatrix([]); }}>Cancel</Button><Button disabled={saving}>{saving ? "Saving…" : "Save User"}</Button></div></div>
      </form>}
    </div>
  </div>;
}
