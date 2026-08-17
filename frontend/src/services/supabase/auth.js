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

// NEW (2026-08-17): self-service registration. Register.jsx previously called
// apiClient.auth.register()/verifyOtp()/resendOtp()/loginWithProvider() -- none of which
// existed anywhere in the Supabase-backed apiClient (supabaseApiClient.js's `auth` object
// only ever had me/logout/resetPasswordRequest/resetPassword). Those were dead calls left
// over from the old Firebase-era apiClient.js's OTP-code + Google-provider flow; every
// registration attempt would have thrown a TypeError immediately. Real Supabase sign-up:
// public.users' `handle_new_auth_user` trigger (0001_initial_schema.sql) auto-creates the
// profile row the moment auth.users gets the new row, so the person appears in
// UserAdmin.jsx's list right away regardless of whether email confirmation is required to
// actually log in yet.
export async function signUp(email, password, options = {}) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options,
  });
  if (error) throw error;
  return data;
}

// Re-sends the signup confirmation email (Supabase's own rate-limited resend endpoint) --
// used by Register.jsx's "Didn't get the email?" action.
export async function resendSignupConfirmation(email, redirectTo) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
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
