import { supabaseApiClient } from "@/api/supabaseApiClient";

// Full Supabase cutover, 2026-08-13 (explicit user instruction: "get every single thing
// off firebase... do the cutover now"). This file used to contain a full parallel Firebase
// Firestore implementation (~340 lines: listCollection/getRecord/createRecord/
// updateRecord/deleteRecord, a request() REST-path router, Firebase Storage upload, and a
// VITE_AUTH_BACKEND switch picking between it and supabaseApiClient) -- removed entirely.
// See git history before this change if any of that implementation detail is ever needed
// again; nothing is destroyed, just no longer live.
//
// Every consumer in this app (21+ files) already only does
// `import { apiClient } from "@/api/apiClient"`, so this is the only file that changes.
export const apiClient = supabaseApiClient;
