import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, MailCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { toast } from "@/components/ui/use-toast";

// REWRITTEN (2026-08-17): the previous version called apiClient.auth.register()/
// verifyOtp()/resendOtp()/loginWithProvider("google") -- none of those methods exist
// anywhere in the live Supabase-backed apiClient (supabaseApiClient.js's `auth` object only
// ever had me/logout/resetPasswordRequest/resetPassword). Every registration attempt threw
// a TypeError immediately -- this page has never actually worked since the Supabase
// cutover. Now uses useAuth().register() (real supabase.auth.signUp(), see
// SupabaseAuthContext.jsx), and shows an honest "check your email" state instead of a fake
// 6-digit code entry (Supabase's default confirmation flow is a clickable email link, not a
// code -- an OTP-entry UI would just never receive anything to type in). The "Continue with
// Google" button is removed entirely rather than left clickable-but-dead: no Google OAuth
// provider is configured/verified for this Supabase project, and shipping a button that
// silently does nothing (or errors) is the same class of bug this rewrite is fixing.
export default function Register() {
  const navigate = useNavigate();
  const { register, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await register(email, password);
      if (result.status === "signed_in") {
        navigate("/");
      } else if (result.status === "confirmation_required") {
        setConfirmationSent(true);
      } else {
        setError(result.message || "Registration failed");
      }
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await resendConfirmation(email);
      toast({ title: "Email sent", description: "Check your inbox for the confirmation link." });
    } catch (err) {
      setError(err.message || "Failed to resend the confirmation email");
    }
  };

  if (confirmationSent) {
    return (
      <AuthLayout
        icon={MailCheck}
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}`}
      >
        <p className="text-sm text-muted-foreground text-center mb-6">
          Click the link in that email to confirm your account, then sign in. Once you've
          signed in, an administrator can select your name under User Management to assign
          your role and permissions.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <Button asChild className="w-full h-12 font-medium mb-3">
          <Link to="/login">Go to sign in</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Didn't get the email?{" "}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Resend
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
