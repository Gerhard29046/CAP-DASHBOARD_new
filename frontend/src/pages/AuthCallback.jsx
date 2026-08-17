import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { Loader2, AlertTriangle, LogIn } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Generic Supabase auth-redirect landing page (2026-08-17, explicit user request: "I want the
// reset-password and auth callback to be pages in the website. It should not be localhost.").
//
// Context: Supabase's client is configured with `detectSessionInUrl: true` (see
// services/supabase/client.js), which means ANY page load -- not just this one -- can exchange
// a redirect link's URL hash (#access_token=...&type=recovery|signup|magiclink) into a real
// session automatically. Two flows already have their own dedicated, working landing page:
//   - Password recovery -> ResetPassword.jsx, redirected there directly by
//     requestPasswordReset()'s own `redirectTo` (supabaseApiClient.js). Unaffected by this file.
//   - Email/password login -> Login.jsx, unaffected by this file.
// What did NOT have a real landing page before this: signup-confirmation links
// (`emailRedirectTo` in SupabaseAuthContext.jsx's register()/resendConfirmation(), previously
// hardcoded to `/login`) and Supabase's own Redirect URL allowlist already listed
// `.../auth/callback` even though no such route existed anywhere in this app -- any Supabase
// flow that happened to land there would have hit this app's catch-all 404 (`PageNotFound`,
// App.jsx's `path="*"`) instead of a real page.
//
// This page is now that real landing page: it waits for the SDK's automatic session exchange,
// then routes based on what actually happened, instead of assuming a specific flow. It
// deliberately defers to the flows above rather than duplicating them -- a PASSWORD_RECOVERY
// event forwards to /reset-password (whose own session check picks the already-established
// session straight back up), any other real session forwards into the app, and no session at
// all (expired/invalid/reused link) shows a clear error with a way back in. Nothing here reads
// or depends on `window.location.origin` being any particular value -- like every other
// Supabase redirect in this app, the actual URL sent to Supabase is built from the real origin
// at request time, so production naturally gets the production URL and local dev naturally
// gets the local one (see the Part B report for exactly what to configure in Supabase).
export default function AuthCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState("checking"); // "checking" | "signed_in" | "invalid"

  useEffect(() => {
    let active = true;

    const settle = (session, event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
        return;
      }
      if (session) {
        setState("signed_in");
        // Small delay purely so the confirmation message is legible before the redirect --
        // matches the feel of ResetPassword.jsx's own post-success `window.location.href`.
        window.setTimeout(() => { if (active) navigate("/", { replace: true }); }, 800);
        return;
      }
      setState("invalid");
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle(data.session, null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      settle(session, event);
    });

    // detectSessionInUrl's exchange is asynchronous; if neither the initial getSession() call
    // nor an auth event resolves things within a few seconds, the link is genuinely
    // missing/invalid/expired rather than just slow -- same reasoning ResetPassword.jsx uses.
    const timeout = window.setTimeout(() => {
      if (active) setState((current) => (current === "checking" ? "invalid" : current));
    }, 4000);

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  if (state === "checking") {
    return (
      <AuthLayout icon={LogIn} title="Signing you in" subtitle="One moment...">
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  if (state === "signed_in") {
    return (
      <AuthLayout icon={LogIn} title="You're signed in" subtitle="Taking you to CAP Dashboard...">
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={AlertTriangle}
      title="Link expired or invalid"
      subtitle="This sign-in link is missing, invalid, or has expired"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          Back to login
        </Link>
      }
    >
      <p className="text-sm text-foreground text-center">
        Please request a new link and try again.
      </p>
    </AuthLayout>
  );
}
