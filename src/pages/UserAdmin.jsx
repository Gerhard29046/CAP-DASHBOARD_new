import React, { useEffect, useState } from "react";
import {
  Shield,
  Wrench,
  BookOpen,
  Check,
  X,
  UserPlus,
  Trash2,
  Save,
} from "lucide-react";

import { ROLE_LABELS, ROLE_COLORS, ROLE_CAPABILITIES, ROLE_NAV_ACCESS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_URL = "http://127.0.0.1:8000/api";

const ROLES = ["Admin", "Technician", "Accountant"];

const ROLE_ICONS = {
  Admin: Shield,
  Technician: Wrench,
  Accountant: BookOpen,
};

const NAV_LABELS = {
  "/": "Dashboard",
  "/clients": "Clients",
  "/upcoming-services": "Upcoming Services",
  "/book-in": "Book In",
  "/jobs": "Jobs",
  "/invoice-queue": "Invoice Queue",
  "/admin/users": "User Management",
};

function authHeaders() {
  const token = localStorage.getItem("auth_token");

  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function UserAdmin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [message, setMessage] = useState(null);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "Technician",
    is_active: true,
  });

  const loadUsers = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to load users");
      }

      const data = await response.json();
      setUsers(data);
    } catch (error) {
      setMessage({
        type: "error",
        text: "Could not load users from Laravel.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newUser),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Could not create user");
      }

      setUsers((prev) => [...prev, data]);
      setNewUser({
        name: "",
        email: "",
        password: "",
        role: "Technician",
        is_active: true,
      });

      setMessage({
        type: "success",
        text: "User created successfully.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not create user.",
      });
    }
  };

  const updateUser = async (userId, updates) => {
    setSavingUserId(userId);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/users/${userId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Could not update user");
      }

      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? data : user))
      );

      setMessage({
        type: "success",
        text: "User updated successfully.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not update user.",
      });
    } finally {
      setSavingUserId(null);
    }
  };

  const deleteUser = async (userId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (!confirmed) return;

    setSavingUserId(userId);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error("Could not delete user");
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));

      setMessage({
        type: "success",
        text: "User deleted successfully.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Could not delete user.",
      });
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          User Management
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create users and control their dashboard access level.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-red-500/30 bg-red-500/10 text-red-500"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground mb-4">
          Role Permissions
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ROLES.map((role) => {
            const Icon = ROLE_ICONS[role];
            const caps = ROLE_CAPABILITIES[role] || {};
            const routes = ROLE_NAV_ACCESS[role] || [];

            return (
              <div key={role} className="bg-secondary/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      ROLE_COLORS[role] || ""
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {ROLE_LABELS[role] || role}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pages
                  </p>

                  {Object.entries(NAV_LABELS).map(([path, label]) => {
                    const allowed = routes.includes(path);

                    return (
                      <div key={path} className="flex items-center gap-1.5">
                        {allowed ? (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        )}

                        <span
                          className={`text-xs ${
                            allowed
                              ? "text-foreground"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1 pt-1 border-t border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </p>

                  {[
                    ["Create records", caps.canCreate],
                    ["Edit records", caps.canEdit],
                    ["Delete records", caps.canDelete],
                    ["Manage users", caps.canManageUsers],
                  ].map(([label, allowed]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      {allowed ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <X className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      )}

                      <span
                        className={`text-xs ${
                          allowed
                            ? "text-foreground"
                            : "text-muted-foreground/40"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground mb-4">
          Create New User
        </h2>

        <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <Label>Name</Label>
            <Input
              value={newUser.name}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, name: e.target.value }))
              }
              required
              className="h-11 rounded-xl mt-1"
            />
          </div>

          <div className="md:col-span-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, email: e.target.value }))
              }
              required
              className="h-11 rounded-xl mt-1"
            />
          </div>

          <div className="md:col-span-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={newUser.password}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, password: e.target.value }))
              }
              required
              className="h-11 rounded-xl mt-1"
            />
          </div>

          <div className="md:col-span-1">
            <Label>Role</Label>
            <Select
              value={newUser.role}
              onValueChange={(value) =>
                setNewUser((prev) => ({ ...prev, role: value }))
              }
            >
              <SelectTrigger className="h-11 rounded-xl mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role] || role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-1 flex items-end">
            <Button type="submit" className="h-11 rounded-xl gap-2 w-full">
              <UserPlus className="w-4 h-4" />
              Create
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground mb-4">
          Team Members
        </h2>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Loading users…
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((user) => {
              const role = user.role || "Technician";
              const Icon = ROLE_ICONS[role] || Wrench;

              return (
                <div
                  key={user.id}
                  className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-xl bg-secondary/40"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        ROLE_COLORS[role] || ""
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user.name || user.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-2 md:items-center">
                    <Select
                      value={role}
                      onValueChange={(value) =>
                        updateUser(user.id, { role: value })
                      }
                      disabled={savingUserId === user.id}
                    >
                      <SelectTrigger className="w-full md:w-40 h-9 rounded-lg text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((roleOption) => (
                          <SelectItem key={roleOption} value={roleOption}>
                            {ROLE_LABELS[roleOption] || roleOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingUserId === user.id}
                      onClick={() =>
                        updateUser(user.id, {
                          is_active: !user.is_active,
                        })
                      }
                      className="h-9 rounded-lg"
                    >
                      {user.is_active ? "Disable" : "Enable"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingUserId === user.id}
                      onClick={() => {
                        const password = window.prompt(
                          `Enter new password for ${user.email}`
                        );

                        if (password && password.length >= 6) {
                          updateUser(user.id, { password });
                        }
                      }}
                      className="h-9 rounded-lg gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Password
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={savingUserId === user.id}
                      onClick={() => deleteUser(user.id)}
                      className="h-9 rounded-lg gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}

            {users.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No users found.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}