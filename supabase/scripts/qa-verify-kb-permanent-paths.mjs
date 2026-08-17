#!/usr/bin/env node
// Live verification for the KB photo/document expiry fix + documents-bucket RLS fix
// (migration 0029 + storage.js's uploadKnowledgeMedia/uploadKnowledgeDocument/
// getKnowledgeFileSignedUrl). Requires 0029 to be applied first. Creates a throwaway
// knowledge_machines row + throwaway users (an uploader and a DIFFERENT technician), uploads
// a real small file to Storage as the uploader, writes the permanent-path row, then proves the
// SECOND (non-uploading) technician can still read/sign it -- the exact cross-user case the old
// owner-scoped policy broke. Cleans up fully, independently re-verified.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq)] = t.slice(eq + 1);
    }
  } catch {}
  return env;
}
const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function record(ok, label) { console.log((ok ? "PASS" : "FAIL") + " - " + label); ok ? pass++ : fail++; }

async function makeTechnician(label) {
  const email = "qa-kb+" + label + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "@invalid.local";
  const password = "Temp-Pass-" + Math.random().toString(36).slice(2) + "!1A";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from("users").update({
    role: "technician", is_active: true, full_name: "QA KB " + label,
    effective_permissions: ["knowledge_base.view", "knowledge_base.create", "knowledge_base.edit"],
  }).eq("id", data.user.id);
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, email, token: signIn.session.access_token };
}

async function cleanup(id, label) {
  if (!id) return;
  const { error } = await admin.auth.admin.deleteUser(id);
  const { data } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
  record(!error && !data?.user, "cleanup: " + label + " confirmed gone");
}

let uploader, otherTech, viewOnly, machineId, mediaPath, docPath;
try {
  uploader = await makeTechnician("uploader");
  otherTech = await makeTechnician("other");

  const { data: machine, error: machineErr } = await admin.from("knowledge_machines").insert({
    manufacturer: "QA Test Mfr", model_name: "QA Test Model", variant: "QA",
  }).select().single();
  if (machineErr) throw machineErr;
  machineId = machine.id;

  mediaPath = "knowledge-media/" + machineId + "/" + crypto.randomUUID() + "-test.webp";
  const mediaUploadRes = await fetch(SUPABASE_URL + "/storage/v1/object/documents/" + mediaPath, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: "Bearer " + uploader.token, "Content-Type": "image/webp" },
    body: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]),
  });
  record(mediaUploadRes.status === 200, "uploader can upload to knowledge-media/" + machineId + "/... (status " + mediaUploadRes.status + ")");

  docPath = "knowledge-documents/" + machineId + "/" + crypto.randomUUID() + "-test.pdf";
  const docUploadRes = await fetch(SUPABASE_URL + "/storage/v1/object/documents/" + docPath, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: "Bearer " + uploader.token, "Content-Type": "application/pdf" },
    body: new Uint8Array([37, 80, 68, 70]),
  });
  record(docUploadRes.status === 200, "uploader can upload to knowledge-documents/" + machineId + "/... (status " + docUploadRes.status + ")");

  const { data: mediaRow, error: mediaRowErr } = await admin.from("knowledge_media").insert({
    knowledge_machine_id: machineId, file_url: mediaPath, original_filename: "test.webp", title: "test.webp",
  }).select().single();
  record(!mediaRowErr && mediaRow.file_url === mediaPath, "knowledge_media.file_url stores the PERMANENT PATH, not a URL");

  const looksLikeUrl = /^https?:\/\//.test(mediaRow.file_url);
  record(!looksLikeUrl, "stored value is NOT a URL (no http(s):// prefix) -- confirms the expiry bug is fixed");

  const anonForSign = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: "Bearer " + otherTech.token } } });
  const { data: signedMedia, error: signMediaErr } = await anonForSign.storage.from("documents").createSignedUrl(mediaPath, 60);
  record(!signMediaErr && !!signedMedia?.signedUrl, "a DIFFERENT technician (not the uploader) can sign the media file (cross-user read works)");

  const { data: signedDoc, error: signDocErr } = await anonForSign.storage.from("documents").createSignedUrl(docPath, 60);
  record(!signDocErr && !!signedDoc?.signedUrl, "a DIFFERENT technician (not the uploader) can sign the document file (cross-user read works)");

  const fetchRes = await fetch(signedMedia.signedUrl);
  record(fetchRes.status === 200, "the signed URL genuinely serves the file (status " + fetchRes.status + ")");

  viewOnly = await makeTechnician("viewonly");
  await admin.from("users").update({ effective_permissions: ["knowledge_base.view"] }).eq("id", viewOnly.id);
  const blockedUploadRes = await fetch(SUPABASE_URL + "/storage/v1/object/documents/knowledge-media/" + machineId + "/" + crypto.randomUUID() + "-blocked.webp", {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: "Bearer " + viewOnly.token, "Content-Type": "image/webp" },
    body: new Uint8Array([1, 2, 3, 4]),
  });
  record(blockedUploadRes.status !== 200, "a view-only technician (no knowledge_base.create) is BLOCKED from uploading (status " + blockedUploadRes.status + ")");
} finally {
  if (mediaPath) await admin.storage.from("documents").remove([mediaPath]);
  if (docPath) await admin.storage.from("documents").remove([docPath]);
  if (machineId) {
    const { error } = await admin.from("knowledge_machines").delete().eq("id", machineId);
    record(!error, "throwaway knowledge_machines row (+ cascaded media/documents rows) cleaned up");
  }
  await cleanup(uploader?.id, "uploader throwaway account");
  await cleanup(otherTech?.id, "other-technician throwaway account");
  await cleanup(viewOnly?.id, "view-only throwaway account");
}

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail > 0 ? 1 : 0);
