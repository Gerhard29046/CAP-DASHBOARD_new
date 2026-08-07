import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/apiClient";
import { supabase } from "@/services/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Which backend's reset-link shape this page needs to recognize. Static import of
// `supabase` above is safe regardless of backend (services/supabase/client.js's env-var
// check is a lazy Proxy, deferred to first real `supabase.*` call -- see
// docs/ai-memory/PROJECT_STATE.md's 2026-08-06 Phase 3 entry) -- this file only actually
// touches it when AUTH_BACKEND is "supabase".
const AUTH_BACKEND = import.meta.env.VITE_AUTH_BACKEND === "supabase" ? "supabase" : "firebase";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  // Firebase's reset link carries an exchangeable `oobCode`/`token` in the query string,
  // consumed explicitly by confirmPasswordReset() below. Supabase's reset link instead
  // carries its tokens in the URL *hash fragment* (#access_token=...&type=recovery), which
  // its client SDK (detectSessionInUrl: true, see services/supabase/client.js) exchanges
  // into a real, already-authenticated recovery session automatically on page load -- there
  // is no discrete token for this page to read from the URL itself. See the effect below.
  const resetToken = searchParams.get("oobCode") || searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [checkingSupabaseSession, setCheckingSupabaseSession] = useState(AUTH_BACKEND === "supabase");
  const [hasSupabaseRecoverySession, setHasSupabaseRecoverySession] = useState(false);

  useEffect(() => {
    if (AUTH_BACKEND !== "supabase") return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSupabaseRecoverySession(Boolean(data.session));
      setCheckingSupabaseSession(false);
    });
    // detectSessionInUrl's exchange can complete slightly after getSession()'s first read
    // on some redirects -- onAuthStateChange's PASSWORD_RECOVERY event is Supabase's own
    // signal that the exchange succeeded, so also listen for it directly rather than
    // relying on timing.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSupabaseRecoverySession(true);
        setCheckingSupabaseSession(false);
      }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const hasValidResetContext = AUTH_BACKEND === "supabase"
    ? hasSupabaseRecoverySession
    : Boolean(resetToken);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await apiClient.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSupabaseSession) {
    return (
      <AuthLayout icon={Lock} title="Checking your reset link" subtitle="One moment...">
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  if (!hasValidResetContext) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Invalid reset link"
        subtitle="This password reset link is missing, invalid, or has expired"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          The link you used appears to be incomplete or expired. Please request a new password reset email.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="New password"
      subtitle="Enter your new password below"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
