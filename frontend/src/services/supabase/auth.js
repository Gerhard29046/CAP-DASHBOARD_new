import { supabase } from "@/services/supabase/client";

// Supabase Auth service. NOT wired into AuthContext.jsx yet -- this is additive scaffolding
// for the Firebase -> Supabase migration (Phase 0/1). frontend/src/lib/AuthContext.jsx still
// uses Firebase Auth today; see docs/ai-memory/DECISIONS.md for cutover status before
// assuming this is live.
//
// supabase-js handles session persistence and token refresh automatically when the client
// is created with persistSession/autoRefreshToken (see client.js) -- no manual refresh loop
// needed here.

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

// Loads the public.users profile row for the current session, mirroring
// AuthContext.jsx's loadUserProfile() against Firestore users/{uid}.
export async function loadUserProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}
