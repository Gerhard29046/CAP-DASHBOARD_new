import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ROLE_LABELS, ROLE_COLORS, ROLE_CAPABILITIES, ROLE_NAV_ACCESS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Shield, Wrench, BookOpen, Check, X } from "lucide-react";

const ROLES = ["admin", "technician", "accountant"];

const ROLE_ICONS = { admin: Shield, technician: Wrench, accountant: BookOpen };

const NAV_LABELS = {
  '/':                  'Dashboard',
  '/clients':           'Clients',
  '/upcoming-services': 'Upcoming Services',
  '/book-in':           'Book In',
  '/jobs':              'Jobs',
  '/invoice-queue':     'Invoice Queue',
  '/admin/users':       'User Admin',
};
export default function UserAdmin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("technician");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const loadUsers = async () => {
    setLoading(true);
    const list = await base44.entities.User.list();
    setUsers(list);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
      loadUsers();
    } catch {
      setInviteMsg({ ok: false, text: "Failed to send invite. Check the email and try again." });
    }
    setInviting(false);
  };

  const handleChangeRole = async (userId, newRole) => {
    setUpdatingId(userId);
    await base44.entities.User.update(userId, { role: newRole });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    setUpdatingId(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">User Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Invite team members and control their access level</p>
      </div>

      {/* Role permission overview */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground mb-4">Role Permissions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ROLES.map(role => {
            const Icon = ROLE_ICONS[role];
            const caps = ROLE_CAPABILITIES[role];
            const routes = ROLE_NAV_ACCESS[role];
            return (
              <div key={role} className="bg-secondary/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${ROLE_COLORS[role]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{ROLE_LABELS[role]}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
                  {Object.entries(NAV_LABELS).map(([path, label]) => (
                    <div key={path} className="flex items-center gap-1.5">
                      {routes.includes(path)
                        ? <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <X className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                      <span className={`text-xs ${routes.includes(path) ? "text-foreground" : "text-muted-foreground/40"}`}>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 pt-1 border-t border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</p>
                  {[["Create records", caps.canCreate], ["Edit records", caps.canEdit], ["Delete records", caps.canDelete], ["Manage users", caps.canManageUsers]].map(([label, allowed]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      {allowed ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                      <span className={`text-xs ${allowed ? "text-foreground" : "text-muted-foreground/40"}`}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite user */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground mb-4">Invite New User</h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Label className="sr-only">Email</Label>
            <Input type="email" placeholder="Email address" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required className="h-11 rounded-xl" />
          </div>
          <div className="w-full sm:w-44">
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={inviting} className="h-11 rounded-xl gap-2 shrink-0">
            <UserPlus className="w-4 h-4" /> {inviting ? "Sending…" : "Send Invite"}
          </Button>
        </form>
        {inviteMsg && (
          <p className={`mt-2 text-sm ${inviteMsg.ok ? "text-emerald-400" : "text-destructive"}`}>{inviteMsg.text}</p>
        )}
      </div>

      {/* Users list */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground mb-4">Team Members</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const role = u.role || "technician";
              const Icon = ROLE_ICONS[role] || Wrench;
              return (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ROLE_COLORS[role] || ""}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.full_name || u.email}</p>
                    {u.full_name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                  </div>
                  <Select value={role} onValueChange={val => handleChangeRole(u.id, val)} disabled={updatingId === u.id}>
                    <SelectTrigger className="w-36 h-9 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No users yet. Invite your first team member above.</p>}
          </div>
        )}
      </div>
    </div>
  );
}