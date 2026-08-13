import React from "react";
import { useSupabaseAuthState } from "@/services/supabase/SupabaseAuthContext";

// Full Supabase cutover, 2026-08-13 (explicit user instruction: "get every single thing
// off firebase... do the cutover now"). This file used to branch on VITE_AUTH_BACKEND
// between a Firebase implementation and a lazy-loaded Supabase bridge; the Firebase
// implementation is removed entirely (see git history before this change if it's ever
// needed again -- nothing here is destroyed, just no longer live). Every existing
// consumer (App.jsx + 12+ other files) already only imports `AuthProvider`/`useAuth`
// from this file, so removing the branch requires zero changes anywhere else.
const AuthContext = React.createContext();

export const AuthProvider = ({ children }) => (
  <AuthContext.Provider value={useSupabaseAuthState()}>
    {children}
  </AuthContext.Provider>
);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
