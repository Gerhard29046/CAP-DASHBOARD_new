#!/usr/bin/env node
// Live authorization-matrix QA for supabase/migrations/0023_dashboard_notes_direct_rls.sql.
// REQUIRES 0023 to already be applied (via the SQL Editor) -- this script does not run DDL.
//
// Creates 3 throwaway Supabase Auth users (creator / other / admin), signs in as each with
// a real session (so auth.uid() resolves correctly under RLS -- the service-role client
// alone cannot test RLS, since it bypasses RLS entirely by design), exercises the exact
// matrix approved for this change, then deletes every throwaway user/note it created.
//
// Usage: node scripts/qa-verify-dashboard-notes-rls.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch { /* fall through to process.env */ }
  return env;
}

const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " -- " + detail : ""}`);
}

async function createTestUser(label) {
  const email = `qa-dashnotes-${label}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${label}) failed: ${error.message}`);
  const uid = data.user.id;
  // Wait for the on_auth_user_created trigger to insert the public.users row.
  await new Promise((r) => setTimeout(r, 500));
  const { error: updateErr } = await admin.from("users").update({ is_active: true }).eq("id", uid);
  if (updateErr) throw new Error(`activate(${label}) failed: ${updateErr.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn(${label}) failed: ${signInErr.message}`);

  return { uid, email, client };
}

async function main() {
  console.log("Creating 3 throwaway users (creator, other, admin)...");
  const creator = await createTestUser("creator");
  const other = await createTestUser("other");
  const adminUser = await createTestUser("admin");
  await admin.from("users").update({ role: "admin" }).eq("id", adminUser.uid);
  // Re-sign-in admin's client isn't needed -- role is read fresh from public.users by
  // is_admin() on every check, not cached in the JWT.

  const createdNoteIds = [];

  try {
    // --- Create own note (creator, other, admin all PASS) --------------------------------
    const { data: creatorNote, error: createErr } = await creator.client
      .from("dashboard_notes")
      .insert({ created_by: creator.uid, content: "Creator's own note", color: "yellow" })
      .select()
      .single();
    record("Create own note: creator", !createErr && creatorNote, createErr?.message);
    if (creatorNote) createdNoteIds.push(creatorNote.id);

    const { data: otherNote, error: otherCreateErr } = await other.client
      .from("dashboard_notes")
      .insert({ created_by: other.uid, content: "Other user's own note", color: "blue" })
      .select()
      .single();
    record("Create own note: other authenticated user", !otherCreateErr && otherNote, otherCreateErr?.message);
    if (otherNote) createdNoteIds.push(otherNote.id);

    const { data: adminNote, error: adminCreateErr } = await adminUser.client
      .from("dashboard_notes")
      .insert({ created_by: adminUser.uid, content: "Admin's own note", color: "green" })
      .select()
      .single();
    record("Create own note: administrator", !adminCreateErr && adminNote, adminCreateErr?.message);
    if (adminNote) createdNoteIds.push(adminNote.id);

    // --- Attempt to create note attributed to another user (creator/other/admin all BLOCKED)
    const { error: spoofByCreator } = await creator.client
      .from("dashboard_notes").insert({ created_by: other.uid, content: "spoofed" }).select().single();
    record("Attempt to create note attributed to another user: creator", Boolean(spoofByCreator), spoofByCreator ? "correctly rejected" : "SECURITY ISSUE: insert succeeded");

    const { error: spoofByOther } = await other.client
      .from("dashboard_notes").insert({ created_by: creator.uid, content: "spoofed" }).select().single();
    record("Attempt to create note attributed to another user: other authenticated user", Boolean(spoofByOther), spoofByOther ? "correctly rejected" : "SECURITY ISSUE: insert succeeded");

    const { error: spoofByAdmin } = await adminUser.client
      .from("dashboard_notes").insert({ created_by: creator.uid, content: "spoofed" }).select().single();
    record("Attempt to create note attributed to another user: administrator", Boolean(spoofByAdmin), spoofByAdmin ? "correctly rejected" : "SECURITY ISSUE: insert succeeded (no admin bypass expected here)");

    // --- created_by_name cannot be spoofed on insert --------------------------------------
    const { data: creatorProfile } = await admin.from("users").select("full_name, email").eq("id", creator.uid).single();
    const expectedName = creatorProfile.full_name || creatorProfile.email || "Someone";
    const { data: spoofNameNote, error: spoofNameErr } = await creator.client
      .from("dashboard_notes")
      .insert({ created_by: creator.uid, content: "trying to spoof my display name", created_by_name: "TOTALLY NOT CREATOR" })
      .select()
      .single();
    record(
      "created_by_name cannot be spoofed on insert",
      !spoofNameErr && spoofNameNote?.created_by_name === expectedName,
      spoofNameErr ? spoofNameErr.message : `stored as "${spoofNameNote?.created_by_name}", expected "${expectedName}"`
    );
    if (spoofNameNote) createdNoteIds.push(spoofNameNote.id);

    // --- Read notes (creator, other, admin all PASS -- global read) ----------------------
    const { data: readAsCreator, error: readCreatorErr } = await creator.client.from("dashboard_notes").select("id");
    record("Read notes: creator", !readCreatorErr && readAsCreator.length >= 3, readCreatorErr?.message);

    const { data: readAsOther, error: readOtherErr } = await other.client.from("dashboard_notes").select("id");
    record("Read notes: other authenticated user", !readOtherErr && readAsOther.length >= 3, readOtherErr?.message);

    const { data: readAsAdmin, error: readAdminErr } = await adminUser.client.from("dashboard_notes").select("id");
    record("Read notes: administrator", !readAdminErr && readAsAdmin.length >= 3, readAdminErr?.message);

    // --- Edit own note (creator, admin PASS) ----------------------------------------------
    const { data: editOwn, error: editOwnErr } = await creator.client
      .from("dashboard_notes").update({ content: "edited by creator" }).eq("id", creatorNote.id).select().single();
    record("Edit own note: creator", !editOwnErr && editOwn?.content === "edited by creator", editOwnErr?.message);

    const { data: adminEditOwn, error: adminEditOwnErr } = await adminUser.client
      .from("dashboard_notes").update({ content: "edited by admin, own note" }).eq("id", adminNote.id).select().single();
    record("Edit own note: administrator", !adminEditOwnErr && adminEditOwn, adminEditOwnErr?.message);

    // --- Edit another user's note (creator/other BLOCKED, admin PASS) --------------------
    const { error: creatorEditOthersErr } = await other.client
      .from("dashboard_notes").update({ content: "hijacked by other" }).eq("id", creatorNote.id).select().single();
    record("Edit another user's note: other authenticated user", Boolean(creatorEditOthersErr), creatorEditOthersErr ? "correctly blocked" : "SECURITY ISSUE: update succeeded");

    const { data: verifyNotHijacked } = await admin.from("dashboard_notes").select("content").eq("id", creatorNote.id).single();
    record("Edit another user's note: content genuinely unchanged after blocked attempt", verifyNotHijacked?.content === "edited by creator", `content is now "${verifyNotHijacked?.content}"`);

    const { data: adminEditOthers, error: adminEditOthersErr } = await adminUser.client
      .from("dashboard_notes").update({ content: "edited by admin" }).eq("id", creatorNote.id).select().single();
    record("Edit another user's note: administrator", !adminEditOthersErr && adminEditOthers?.content === "edited by admin", adminEditOthersErr?.message);

    // --- created_by_name pinned across updates (creator's own edit above did not change it)
    const { data: nameAfterEdits } = await admin.from("dashboard_notes").select("created_by_name").eq("id", creatorNote.id).single();
    record(
      "created_by_name unchanged after edits (incl. by a different user/admin)",
      nameAfterEdits?.created_by_name === expectedName,
      `stored as "${nameAfterEdits?.created_by_name}", expected "${expectedName}"`
    );

    // --- Delete another user's note (other BLOCKED, verified via row still existing) -----
    await other.client.from("dashboard_notes").delete().eq("id", creatorNote.id);
    const { data: stillExists } = await admin.from("dashboard_notes").select("id").eq("id", creatorNote.id).maybeSingle();
    record("Delete another user's note: other authenticated user", Boolean(stillExists), stillExists ? "correctly blocked (row still exists)" : "SECURITY ISSUE: row was deleted");

    // --- Delete own note (creator PASS) ---------------------------------------------------
    await creator.client.from("dashboard_notes").delete().eq("id", creatorNote.id);
    const { data: creatorNoteGone } = await admin.from("dashboard_notes").select("id").eq("id", creatorNote.id).maybeSingle();
    record("Delete own note: creator", !creatorNoteGone, creatorNoteGone ? "row still exists" : "correctly deleted");
    if (!creatorNoteGone) createdNoteIds.splice(createdNoteIds.indexOf(creatorNote.id), 1);

    // --- Delete another user's note (admin PASS) -------------------------------------------
    await adminUser.client.from("dashboard_notes").delete().eq("id", otherNote.id);
    const { data: otherNoteGone } = await admin.from("dashboard_notes").select("id").eq("id", otherNote.id).maybeSingle();
    record("Delete another user's note: administrator", !otherNoteGone, otherNoteGone ? "row still exists" : "correctly deleted");
    if (!otherNoteGone) createdNoteIds.splice(createdNoteIds.indexOf(otherNote.id), 1);

    // --- CHECK constraints ------------------------------------------------------------------
    const { error: badColorErr } = await creator.client
      .from("dashboard_notes").insert({ created_by: creator.uid, content: "bad color", color: "purple" }).select().single();
    record("color CHECK constraint rejects an invalid value", Boolean(badColorErr), badColorErr ? badColorErr.message : "SECURITY/DATA ISSUE: insert succeeded with invalid color");

    const { data: tooLongNote, error: tooLongErr } = await creator.client
      .from("dashboard_notes").insert({ created_by: creator.uid, content: "x".repeat(2001) }).select().single();
    record("content length CHECK constraint rejects >2000 chars", Boolean(tooLongErr), tooLongErr ? tooLongErr.message : "DATA ISSUE: insert succeeded with 2001 chars");
    if (tooLongNote) createdNoteIds.push(tooLongNote.id);

    const { data: exactlyMaxNote, error: exactlyMaxErr } = await creator.client
      .from("dashboard_notes").insert({ created_by: creator.uid, content: "x".repeat(2000) }).select().single();
    record("content length CHECK constraint allows exactly 2000 chars", !exactlyMaxErr && exactlyMaxNote, exactlyMaxErr?.message);
    if (exactlyMaxNote) createdNoteIds.push(exactlyMaxNote.id);
  } finally {
    // --- Cleanup: delete every note this script created (service-role, bypasses RLS) ------
    console.log("\nCleaning up...");
    for (const id of createdNoteIds) {
      await admin.from("dashboard_notes").delete().eq("id", id);
    }
    // adminNote/spoofNameNote/otherNote/creatorNote may already be deleted above -- also
    // sweep by created_by for these 3 throwaway uids as a belt-and-suspenders final check.
    await admin.from("dashboard_notes").delete().in("created_by", [creator.uid, other.uid, adminUser.uid]);
    const { data: residual } = await admin.from("dashboard_notes").select("id").in("created_by", [creator.uid, other.uid, adminUser.uid]);
    record("Full cleanup: zero residual test notes", (residual || []).length === 0, `${(residual || []).length} left`);

    for (const u of [creator, other, adminUser]) {
      await admin.auth.admin.deleteUser(u.uid);
    }
    let allGone = true;
    for (const u of [creator, other, adminUser]) {
      const { data: stillThere } = await admin.auth.admin.getUserById(u.uid).catch(() => ({ data: null }));
      if (stillThere?.user) allGone = false;
    }
    record("Full cleanup: all 3 throwaway auth users deleted", allGone);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Script failed:", e.message);
  process.exit(1);
});
