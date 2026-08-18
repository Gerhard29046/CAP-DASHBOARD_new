import { supabase } from "@/services/supabase/client";
import { sanitizeForWrite } from "@/lib/sanitizeForWrite";

// Generic Supabase table helpers. Not wired into apiClient.js yet -- entity-specific
// services (CustomerService, JobCardService, etc. -- Phase 1) should be built on top of
// these rather than pages calling supabase.from(...) directly, matching the existing
// apiClient.js abstraction boundary (no page should call the backend SDK directly).
//
// createRow()/updateRow() run every write through sanitizeForWrite() first -- see
// src/lib/sanitizeForWrite.js for why (empty-string form fields breaking date/numeric
// columns). Re-exported here so existing importers (supabaseApiClient.js's singleton
// settings APIs, which bypass these helpers via raw supabase.from() calls) don't need a
// second import path.
export { sanitizeForWrite };

export async function listRows(table, { filters = {}, orderBy, limit } = {}) {
  let query = supabase.from(table).select("*");
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getRow(table, id) {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createRow(table, values) {
  const { data, error } = await supabase.from(table).insert(sanitizeForWrite(values)).select().single();
  if (error) throw error;
  return data;
}

export async function updateRow(table, id, values) {
  const { data, error } = await supabase.from(table).update(sanitizeForWrite(values)).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// Realtime subscription helper (Phase 2+ usage) -- subscribes to postgres_changes for a
// table and invokes callback with the raw payload. Caller owns unsubscribe.
export function subscribeToTable(table, callback, filter) {
  const channel = supabase
    .channel(`public:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table, filter }, callback)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
