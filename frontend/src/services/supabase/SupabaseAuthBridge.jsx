import React from "react";
import { useSupabaseAuthState } from "@/services/supabase/SupabaseAuthContext";

// Dynamically imported by frontend/src/lib/AuthContext.jsx ONLY when
// VITE_AUTH_BACKEND=supabase is explicitly set at build time. Writes Supabase-backed auth
// state into the SAME shared React context AuthContext.jsx already exports (passed in as
// the `context` prop), so useAuth() keeps working completely unchanged for every existing
// consumer (13+ files) regardless of which backend is active -- zero import changes needed
// anywhere else in the app.
//
// This file (and everything it imports, including services/supabase/client.js, which
// fail-fasts if VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set) is deliberately never
// statically imported from AuthContext.jsx -- only ever reached via a dynamic import() that
// AuthContext.jsx guards behind the VITE_AUTH_BACKEND check, so the default (Firebase)
// production build never evaluates this module and can never crash because Supabase env
// vars happen to be unset. See docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md section 3 /
// PHASE2_CUTOVER_CHECKLIST.md section 3.1.
export default function SupabaseAuthBridge({ context: SharedAuthContext, children }) {
  const value = useSupabaseAuthState();
  return <SharedAuthContext.Provider value={value}>{children}</SharedAuthContext.Provider>;
}
