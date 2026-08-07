import React, { createContext, useContext, useEffect, useState, Suspense, lazy } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, getDocs, limit, query, where, collection } from "firebase/firestore";
import { auth, authPersistenceReady, db } from "@/lib/firebase";

const AuthContext = createContext();

// Phase 3 (2026-08-06): which auth backend is active. Defaults to "firebase" -- Firebase
// remains the live production path unless this build-time env var is explicitly set to
// "supabase". See docs/migration/PHASE2_CUTOVER_CHECKLIST.md section 3.1.
const AUTH_BACKEND = import.meta.env.VITE_AUTH_BACKEND === "supabase" ? "supabase" : "firebase";

// Only constructed (and its factory only ever invoked by React, on first render of the
// supabase branch) when AUTH_BACKEND is actually "supabase" -- the dynamic import() this
// wraps, and everything it transitively pulls in (including services/supabase/client.js,
// which fail-fasts if Supabase env vars are missing), is NEVER evaluated in the default
// (Firebase) production build. This is deliberate: it protects production from crashing
// just because Supabase env vars aren't configured yet, even though the flag defaults off.
const LazySupabaseAuthBridge = AUTH_BACKEND === "supabase"
  ? lazy(() => import("@/services/supabase/SupabaseAuthBridge"))
  : null;

function AuthBackendLoadingFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin"></div>
    </div>
  );
}

function normalizeProfile(snapshot, firebaseUser) {
  const data = snapshot.data();
  const rawPermissions = data.effective_permissions ?? data.permissions ?? [];
  const permissions = Array.isArray(rawPermissions)
    ? rawPermissions
    : Object.entries(rawPermissions).filter(([, allowed]) => allowed).map(([key]) => key);

  return {
    ...data,
    id: firebaseUser.uid,
    uid: firebaseUser.uid,
    email: data.email || firebaseUser.email,
    is_active: data.is_active ?? data.active ?? false,
    effective_permissions: permissions,
  };
}

async function loadUserProfile(firebaseUser) {
  const direct = await getDoc(doc(db, "users", firebaseUser.uid));
  if (direct.exists()) return normalizeProfile(direct, firebaseUser);

  const matches = await getDocs(query(
    collection(db, "users"),
    where("email", "==", firebaseUser.email.toLowerCase()),
    limit(1),
  ));
  if (matches.empty) throw Object.assign(new Error("User profile not found."), { code: "profile/not-found" });
  return normalizeProfile(matches.docs[0], firebaseUser);
}

function firebaseMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Incorrect email address or password.";
    case "auth/user-disabled":
      return "This account is disabled.";
    case "auth/network-request-failed":
      return "Network unavailable. Please check your connection.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Permission denied by Firestore.";
    case "profile/not-found":
      return "User profile not found.";
    default:
      return "Unable to connect to Firebase.";
  }
}

// Unchanged Firebase implementation, only renamed (was exported directly as AuthProvider)
// so the exported AuthProvider below can route to it explicitly.
const FirebaseAuthProviderImpl = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      if (!firebaseUser) {
        setUser(null);
        setIsLoadingAuth(false);
        return;
      }
      try {
        const profile = await loadUserProfile(firebaseUser);
        if (!profile.is_active) {
          await signOut(auth);
          throw Object.assign(new Error("This account is disabled."), { code: "auth/user-disabled" });
        }
        if (active) {
          setUser(profile);
          setAuthError(null);
        }
      } catch (error) {
        if (active) {
          setUser(null);
          setAuthError({ type: error.code === "profile/not-found" ? "user_not_registered" : "firebase_error", message: firebaseMessage(error) });
        }
      } finally {
        if (active) setIsLoadingAuth(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      await authPersistenceReady;
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await loadUserProfile(credential.user);
      if (!profile.is_active) {
        await signOut(auth);
        throw Object.assign(new Error("This account is disabled."), { code: "auth/user-disabled" });
      }
      setUser(profile);
      return true;
    } catch (error) {
      setUser(null);
      setAuthError({ type: "firebase_error", message: firebaseMessage(error) });
      return false;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    window.location.href = "/login";
  };

  const checkUserAuth = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return null;
    const profile = await loadUserProfile(firebaseUser);
    setUser(profile);
    return profile;
  };

  const hasPermission = (key) => user?.role === "admin" || user?.effective_permissions?.includes(key) || false;
  const hasAnyPermission = (keys) => keys.some(hasPermission);
  const hasAllPermissions = (keys) => keys.every(hasPermission);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked: !isLoadingAuth,
      login,
      logout,
      navigateToLogin: () => { window.location.href = "/login"; },
      checkUserAuth,
      refreshCurrentUser: checkUserAuth,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      checkAppState: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Public entry point every consumer already imports (frontend/src/App.jsx + 12 other
// files). Routes to whichever backend AUTH_BACKEND selects, but both branches write into
// the SAME `AuthContext` above, so useAuth() below is 100% unchanged regardless of backend.
export const AuthProvider = ({ children }) => {
  if (AUTH_BACKEND === "supabase" && LazySupabaseAuthBridge) {
    return (
      <Suspense fallback={<AuthBackendLoadingFallback />}>
        <LazySupabaseAuthBridge context={AuthContext}>{children}</LazySupabaseAuthBridge>
      </Suspense>
    );
  }
  return <FirebaseAuthProviderImpl>{children}</FirebaseAuthProviderImpl>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
