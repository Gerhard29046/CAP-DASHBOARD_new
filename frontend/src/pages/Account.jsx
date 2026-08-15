import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/api/apiClient";
import { uploadProfilePhoto, getProfilePhotoSignedUrl } from "@/services/supabase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, User2, Pencil, Check, X } from "lucide-react";

// Cross-platform parity Phase 7 (Account/Profile + profile photo). Neither platform had any
// self-service account page before this -- confirmed by reading App.jsx's full route list
// directly, not assumed (every existing "user management" surface, UserAdmin.jsx, is
// admin-editing-OTHERS, not self-service). Mirrors mobile-android's own AccountScreen additions
// this same phase: editable full_name + photo, read-only email/role (email changes need
// Supabase Auth's own dedicated flow, not a plain column update; role is admin-only elsewhere,
// enforced server-side by restrict_self_user_update_trigger -- not re-implemented here).
//
// REAL CONSTRAINT, not optional: migration 0026 (public.users.photo_path + profile-images
// bucket RLS fix) is written but NOT yet applied to production as of this page being built. A
// save attempted before then will fail server-side with a real error -- this page shows that
// error honestly rather than faking success, so it already works correctly the moment the
// migration lands, with no further UI change needed.
export default function Account() {
  const { user, refreshCurrentUser } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.photo_path) {
      setPhotoUrl(null);
      return undefined;
    }
    getProfilePhotoSignedUrl(user.photo_path)
      .then((url) => { if (!cancelled) setPhotoUrl(url); })
      .catch(() => { if (!cancelled) setPhotoUrl(null); });
    return () => { cancelled = true; };
  }, [user?.photo_path]);

  const startEditingName = () => {
    setNameDraft(user?.full_name || "");
    setNameError(null);
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) { setNameError("Name is required."); return; }
    setSavingName(true);
    setNameError(null);
    try {
      await apiClient.entities.User.update(user.id, { full_name: trimmed });
      await refreshCurrentUser();
      setEditingName(false);
    } catch (error) {
      setNameError(error?.message || "Could not save your name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const path = await uploadProfilePhoto(user.id, file);
      await apiClient.entities.User.update(user.id, { photo_path: path });
      await refreshCurrentUser();
    } catch (error) {
      setPhotoError(error?.message || "Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-heading font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">Your profile information.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        {/* Photo */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User2 className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <label className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer">
              <Camera className="w-3.5 h-3.5" />
              {uploadingPhoto ? "Uploading…" : "Change photo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoChange}
                disabled={uploadingPhoto}
                className="hidden"
              />
            </label>
            {photoError && <p className="text-xs text-destructive mt-1">{photoError}</p>}
          </div>
        </div>

        {/* Name */}
        <div>
          <Label className="text-xs text-muted-foreground">Name</Label>
          {editingName ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                className="h-10"
                disabled={savingName}
              />
              <Button size="icon" variant="outline" className="shrink-0" onClick={saveName} disabled={savingName}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="outline" className="shrink-0" onClick={() => setEditingName(false)} disabled={savingName}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditingName}
              className="w-full flex items-center justify-between gap-2 mt-1 h-10 px-1 rounded-lg hover:bg-secondary/50 transition-colors text-left"
            >
              <span className="text-sm text-foreground">{user.full_name || "Not set"}</span>
              <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          )}
          {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
        </div>

        {/* Email (read-only) */}
        <div>
          <Label className="text-xs text-muted-foreground">Email</Label>
          <p className="text-sm text-foreground mt-1 h-10 flex items-center px-1">{user.email}</p>
        </div>

        {/* Role (read-only) */}
        <div>
          <Label className="text-xs text-muted-foreground">Role</Label>
          <p className="text-sm text-foreground mt-1 h-10 flex items-center px-1 capitalize">{user.role}</p>
        </div>
      </div>
    </div>
  );
}
