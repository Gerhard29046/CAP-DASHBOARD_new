import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import {
  loadUserProfile, requestPasswordReset, signInWithPassword, signOut as supabaseSignOut,
  signUp, resendSignupConfirmation,
} from "@/services/supabase/auth";

// Parallel Supabase-backed auth context, matching frontend/src/lib/AuthContext.jsx's
// public interface (user/isAuthenticated/isLoadingAuth/authError/login/logout/
// checkUserAuth/refreshCurrentUser/hasPermission/hasAnyPermission/hasAllPermissions) so
// that swapping AuthProvider -> SupabaseAuthProvider in App.jsx (Phase 2, not done yet)
// is a near drop-in replacement. NOT wired into App.jsx yet -- Firebase's AuthContext
// remains the live one. See docs/ai-memory/DECISIONS.md 2026-08-03 entries.

const SupabaseAuthContext = createContext();

function normalizeProfile(profileRow) {
  const rawPermissions = profileRow.effective_permissions ?? [];
  const permissions = Array.isArray(rawPermissions) ? rawPermissions : [];
  return {
    ...profileRow,
    uid: profileRow.id,
    effective_permissions: permissions,
  };
}

function supabaseAuthMessage(error) {
  switch (error?.message) {
    case "Invalid login credentials":
      return "Incorrect email address or password.";
    case "Email not confirmed":
      return "Please confirm your email address before signing in.";
    default:
      return error?.message || "Unable to connect to Supabase.";
  }
}

// Extracted (2026-08-06, Phase 3 prep) so the same state logic can be consumed either by
// this file's own standalone SupabaseAuthProvider/SupabaseAuthContext (unchanged, kept for
// any standalone/test use), or by SupabaseAuthBridge.jsx, which writes this same value into
// the shared AuthContext from frontend/src/lib/AuthContext.jsx instead -- so useAuth()
// keeps working unchanged for every existing consumer regardless of which backend is
// active. See docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md section 3 / PHASE2_CUTOVER_
// CHECKLIST.md section 3.1.
export function useSupabaseAuthState() {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadFromSession(session) {
      if (!session?.user) {
        if (active) { setUser(null); setIsLoadingAuth(false); }
        return;
      }
      try {
        const profileRow = await loadUserProfile(session.user.id);
        if (!profileRow.is_active) {
          await supabaseSignOut();
          throw Object.assign(new Error("This account is disabled."), { code: "profile/inactive" });
        }
        if (active) { setUser(normalizeProfile(profileRow)); setAuthError(null); }
      } catch (error) {
        if (active) {
          setUser(null);
          setAuthError({
            type: error.code === "profile/inactive" ? "user_disabled" : "supabase_error",
            message: supabaseAuthMessage(error),
          });
        }
      } finally {
        if (active) setIsLoadingAuth(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => loadFromSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => loadFromSession(session));

    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      const { user: authUser } = await signInWithPassword(email, password);
      const profileRow = await loadUserProfile(authUser.id);
      if (!profileRow.is_active) {
        await supabaseSignOut();
        throw Object.assign(new Error("This account is disabled."), { code: "profile/inactive" });
      }
      setUser(normalizeProfile(profileRow));
      return true;
    } catch (error) {
      setUser(null);
      setAuthError({ type: "supabase_error", message: supabaseAuthMessage(error) });
      return false;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // NEW (2026-08-17): real self-service registration, replacing Register.jsx's previously
  // entirely-nonfunctional apiClient.auth.register()/verifyOtp() calls (see auth.js's
  // signUp() header comment). Deliberately does NOT assume a session comes back -- most
  // Supabase projects require email confirmation before a session is issued, so the caller
  // needs to branch on `status`, not assume "signed_in" every time. Also deliberately does
  // NOT touch `user`/local auth state on the "confirmation_required" path, so calling this
  // from an already-signed-in session (e.g. an admin using this page to create a colleague's
  // account) can't silently clobber the admin's own session unless Supabase actually hands
  // back an immediate session (email confirmation disabled project-wide).
  const register = async (email, password) => {
    setAuthError(null);
    try {
      const data = await signUp(email, password, {
        // 2026-08-17: was `/login`, a plain page with no idea a confirmation link brought the
        // user there. `/auth/callback` (AuthCallback.jsx) now exists specifically to receive
        // any Supabase auth redirect, exchange the session Supabase's client SDK already
        // parses from the link automatically, and forward into the app with a real
        // "You're signed in" moment -- also finally gives this app's already-configured
        // Supabase Redirect URL for `.../auth/callback` something real to point at.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      });
      if (data.session?.user) {
        const profileRow = await loadUserProfile(data.session.user.id);
        setUser(normalizeProfile(profileRow));
        return { status: "signed_in" };
      }
      return { status: "confirmation_required" };
    } catch (error) {
      const message = supabaseAuthMessage(error);
      setAuthError({ type: "supabase_error", message });
      return { status: "error", message };
    }
  };

  const resendConfirmation = async (email) => {
    await resendSignupConfirmation(email, `${window.location.origin}/auth/callback`);
  };

  const logout = async () => {
    await supabaseSignOut();
    setUser(null);
    window.location.href = "/login";
  };

  const checkUserAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return null;
    const profileRow = await loadUserProfile(data.session.user.id);
    setUser(normalizeProfile(profileRow));
    return profileRow;
  };

  const hasPermission = (key) => user?.role === "admin" || user?.effective_permissions?.includes(key) || false;
  const hasAnyPermission = (keys) => keys.some(hasPermission);
  const hasAllPermissions = (keys) => keys.every(hasPermission);

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    appPublicSettings: null,
    authChecked: !isLoadingAuth,
    login,
    register,
    resendConfirmation,
    logout,
    requestPasswordReset,
    navigateToLogin: () => { window.location.href = "/login"; },
    checkUserAuth,
    refreshCurrentUser: checkUserAuth,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    checkAppState: async () => {},
  };
}

export const SupabaseAuthProvider = ({ children }) => (
  <SupabaseAuthContext.Provider value={useSupabaseAuthState()}>
    {children}
  </SupabaseAuthContext.Provider>
);

export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) throw new Error("useSupabaseAuth must be used within a SupabaseAuthProvider");
  return context;
};
