import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function RoleGuard({
  children,
  allowedRoles = [],
  requiredPermission,
}) {
  const { user, isAuthenticated, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return null;
  }

  const denied = requiredPermission
    ? !hasPermission(requiredPermission)
    : !allowedRoles.map(role => role.toLowerCase()).includes(user.role?.toLowerCase());

  if (denied) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="bg-card border border-border rounded-2xl shadow-lg p-8 text-center max-w-md">
          <h1 className="text-2xl font-bold text-destructive mb-3">
            Access Denied
          </h1>

          <p className="text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
