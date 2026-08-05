import { supabase } from "@/services/supabase/client";
import { listRows, getRow, createRow, updateRow, deleteRow, subscribeToTable } from "@/services/supabase/database";
import {
  ClientService, MachineService, ServiceRecordService, JobCardService, JobCardLineService,
  SiteService, UserService, PermissionService, RolePermissionService, KnowledgeBaseService,
} from "@/services/supabase/entities";
import { getSignedUrl, uploadFile } from "@/services/supabase/storage";
import { requestPasswordReset as supabaseRequestPasswordReset, updatePassword, signOut as supabaseSignOut, loadUserProfile } from "@/services/supabase/auth";
import { optimizeImageForUpload } from "@/lib/imageOptimize";
import { callFunction } from "@/api/functionsClient";

// Supabase-backed drop-in replacement for frontend/src/api/apiClient.js, matching its
// exported shape (request/entities/integrations/auth) so a future Phase 2 swap is close to
// a one-line import change in whatever imports `apiClient`. NOT imported by any page or
// App.jsx yet -- Firebase's apiClient.js remains the live data path. Built entirely on the
// existing frontend/src/services/supabase/{client,database,entities,storage,auth}.js
// scaffolding (Phase 0/1) -- see docs/ai-memory/DECISIONS.md for migration phase status.
//
// Google Calendar routes are deliberately NOT re-implemented here -- that integration is
// Firebase Cloud Functions-based by design (see CLAUDE.md section 7 / DECISIONS.md
// "Google Calendar moved from Laravel to Firebase Cloud Functions") and is out of scope
// for this Firestore/Postgres migration regardless of which data layer the rest of the app
// uses. Both this file and apiClient.js call the same `callFunction` for those routes.
//
// Known behavioral differences from apiClient.js, called out inline where they occur:
//  - `roles/permissions` and `users/:id/permissions`: Postgres's `role_permissions` is a
//    normalized (role, permission_key) table, not one Firestore doc per role with a
//    `permissions` array -- adapted below, same external response shape.
//  - `knowledge-service-codes/:id/reveal`: as of 0013_knowledge_subcollections_real_fields.sql
//    the Postgres column is `service_code`, matching the Firestore field name directly (the
//    original 0001 schema had this wrong as `code` -- fixed 2026-08-05, see KNOWN_ISSUES.md).
//  - `auth.resetPassword`: Supabase's recovery flow establishes a session via the emailed
//    link redirect first; there is no Firebase-style opaque `resetToken` you exchange
//    directly for a new password. This assumes a recovery session already exists (i.e.
//    the caller landed here via that redirect) and calls `updateUser({ password })`.

const routeCollections = {
  clients: "clients",
  machines: "machines",
  "service-records": "service_records",
  "job-cards": "job_cards",
  "job-card-lines": "job_card_lines",
  sites: "sites",
  users: "users",
  "admin/users": "users",
  "knowledge-machines": "knowledge_machines",
  "knowledge-notes": "knowledge_notes",
  "knowledge-service-codes": "knowledge_service_codes",
  "knowledge-media": "knowledge_media",
  "knowledge-documents": "knowledge_documents",
  permissions: "permissions",
};

function applyListOptions(items, sort, limit) {
  const result = [...items];
  if (sort) {
    const descending = sort.startsWith("-");
    const field = descending ? sort.slice(1) : sort;
    result.sort((a, b) => String(a[field] ?? "").localeCompare(String(b[field] ?? "")) * (descending ? -1 : 1));
  }
  return limit ? result.slice(0, limit) : result;
}

function withPermissionCount(record) {
  if (record && Array.isArray(record.effective_permissions)) {
    return { ...record, effective_permission_count: record.effective_permissions.length };
  }
  return record;
}

function makeEntity(table) {
  return {
    list: async (sort, limit) => applyListOptions((await listRows(table)).map(withPermissionCount), sort, limit),
    get: async (id) => withPermissionCount(await getRow(table, id)),
    create: async (data) => withPermissionCount(await createRow(table, data)),
    update: async (id, data) => withPermissionCount(await updateRow(table, id, data)),
    delete: async (id) => { await deleteRow(table, id); return null; },
    filter: async (conditions = {}, sort, limit) =>
      applyListOptions((await listRows(table, { filters: conditions })).map(withPermissionCount), sort, limit),
    subscribe: (conditions = {}, onData, onError, sort, limit) => {
      // postgres_changes payloads are per-row deltas, not full result sets -- callers
      // relying on apiClient.js's snapshot-style "full current list on every change"
      // behavior will need re-querying here once this is actually wired up. Flagged, not
      // solved, since no page consumes this yet.
      const filterKey = Object.keys(conditions)[0];
      const filter = filterKey ? `${filterKey}=eq.${conditions[filterKey]}` : undefined;
      return subscribeToTable(table, async () => {
        try {
          onData(applyListOptions((await listRows(table, { filters: conditions })).map(withPermissionCount), sort, limit));
        } catch (error) {
          onError?.(error);
        }
      }, filter);
    },
    watch: (id, onData, onError) => subscribeToTable(table, async () => {
      try {
        onData(withPermissionCount(await getRow(table, id)));
      } catch (error) {
        onError?.(error);
      }
    }, `id=eq.${id}`),
  };
}

const clientEntity = makeEntity("clients");
clientEntity.get = async (id) => {
  const [client, machines] = await Promise.all([
    getRow("clients", id),
    MachineService.listForClient(id),
  ]);
  return { ...withPermissionCount(client), machines };
};

function parseBody(options) {
  if (!options.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

async function calendarEvents(searchParams) {
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const includeServices = searchParams.get("include_services") !== "0";
  const includeGoogle = searchParams.get("include_google") === "1";

  let events = [];
  const warnings = [];
  let googleReason = null;

  if (includeServices) {
    const [services, machines, clients] = await Promise.all([
      listRows("service_records"),
      listRows("machines"),
      listRows("clients"),
    ]);
    const machineById = Object.fromEntries(machines.map((item) => [String(item.id), item]));
    const clientById = Object.fromEntries(clients.map((item) => [String(item.id), item]));
    events = services.filter((service) => service.next_service_due)
      .filter((service) => !start || service.next_service_due >= start.slice(0, 10))
      .filter((service) => !end || service.next_service_due < end.slice(0, 10))
      .map((service) => {
        const machine = machineById[String(service.machine_id)] || {};
        const client = clientById[String(machine.client_id)] || {};
        return {
          id: `service-${service.id}`,
          title: `${client.company_name || "Client"} – ${machine.brand || ""} ${machine.model || ""}`.trim(),
          start: service.next_service_due,
          allDay: true,
          extendedProps: {
            sourceType: "service_record",
            serviceRecordId: service.id,
            machineId: machine.id,
            clientId: client.id,
            clientName: client.company_name,
            machineBrand: machine.brand,
            machineModel: machine.model,
            serialNumber: machine.serial_number,
            refrigerantType: machine.refrigerant_type,
            technician: service.technician_name,
            status: service.status,
            notes: service.notes,
          },
        };
      });
  }

  if (includeGoogle) {
    try {
      const googleParams = new URLSearchParams();
      if (start) googleParams.set("start", start);
      if (end) googleParams.set("end", end);
      const googleResult = await callFunction("googleCalendarEvents", { searchParams: googleParams });
      events = events.concat(googleResult?.events || []);
      googleReason = googleResult?.reason || null;
      if (Array.isArray(googleResult?.warnings)) warnings.push(...googleResult.warnings);
    } catch (error) {
      console.error("Failed to load Google Calendar events", error);
      googleReason = "function_unavailable";
    }
  }

  return { events, warnings, google_reason: googleReason };
}

const googleCalendarFunctionMap = {
  status: { GET: "googleCalendarStatus" },
  connect: { GET: "googleCalendarConnect" },
  calendars: { GET: "googleCalendarListCalendars", PUT: "googleCalendarSelectCalendars", POST: "googleCalendarSelectCalendars" },
  display: { PATCH: "googleCalendarSetDisplayEnabled" },
  disconnect: { DELETE: "googleCalendarDisconnect", POST: "googleCalendarDisconnect" },
};

async function googleCalendarRoute(action, method, options) {
  const methodMap = googleCalendarFunctionMap[action];
  const functionName = methodMap && methodMap[method];
  if (!functionName) {
    throw Object.assign(new Error(`Unsupported Google Calendar operation: ${method} ${action}`), { status: 405 });
  }
  if (functionName === "googleCalendarSelectCalendars") {
    return callFunction(functionName, { method: "PUT", body: parseBody(options) });
  }
  if (functionName === "googleCalendarSetDisplayEnabled") {
    return callFunction(functionName, { method: "PATCH", body: parseBody(options) });
  }
  return callFunction(functionName, { method: functionName === "googleCalendarDisconnect" ? "DELETE" : "GET" });
}

async function request(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
  const method = (options.method || "GET").toUpperCase();
  const url = new URL(path, "https://cap.local");
  const segments = url.pathname.replace(/^\//, "").split("/").filter(Boolean);

  if (segments[0] === "me") return supabaseApiClient.auth.me();
  if (segments[0] === "calendar" && segments[1] === "events") return calendarEvents(url.searchParams);
  if (segments[0] === "google-calendar" && segments[1]) return googleCalendarRoute(segments[1], method, options);
  if (segments[0] === "knowledge-machines" && segments[1] && segments[2]) {
    const childCollections = {
      notes: "knowledge_notes",
      media: "knowledge_media",
      documents: "knowledge_documents",
      "service-codes": "knowledge_service_codes",
    };
    const childCollection = childCollections[segments[2]];
    if (childCollection) {
      if (method === "GET") return listRows(childCollection, { filters: { knowledge_machine_id: segments[1] } });
      if (method === "POST") return createRow(childCollection, {
        ...parseBody(options),
        knowledge_machine_id: segments[1],
      });
    }
  }
  if (segments[0] === "knowledge-service-codes" && segments[1] && segments[2] === "reveal") {
    const record = await getRow("knowledge_service_codes", segments[1]);
    return { service_code: record.service_code };
  }
  if (segments[0] === "roles" && segments[1] === "permissions") {
    const rows = await listRows("role_permissions");
    return rows.reduce((byRole, row) => {
      const key = row.role || row.id;
      byRole[key] = byRole[key] || { role: key, permissions: [] };
      byRole[key].permissions.push(row.permission_key);
      return byRole;
    }, {});
  }
  if (segments[0] === "users" && segments[2] === "permissions") {
    const [profile, permissions, roleDefaultRows] = await Promise.all([
      getRow("users", segments[1]),
      listRows("permissions"),
      listRows("role_permissions"),
    ]);
    const defaults = new Set(
      roleDefaultRows.filter((row) => row.role === profile.role).map((row) => row.permission_key),
    );
    const effective = new Set(profile.effective_permissions || []);
    const overrides = profile.permission_overrides || {};
    return {
      ...withPermissionCount(profile),
      permissions: permissions.map((permission) => ({
        ...permission,
        role_default: defaults.has(permission.key),
        effective: effective.has(permission.key),
        user_override: Object.hasOwn(overrides, permission.key) ? overrides[permission.key] : null,
      })),
    };
  }

  let routeKey = segments[0];
  let id = segments[1];
  if (segments[0] === "admin" && segments[1] === "users") {
    routeKey = "admin/users";
    id = segments[2];
  }
  const table = routeCollections[routeKey];
  if (!table) throw Object.assign(new Error(`Supabase route is not available: ${url.pathname}`), { status: 501 });

  if (method === "GET" && id) return withPermissionCount(await getRow(table, id));
  if (method === "GET") {
    const filters = Object.fromEntries(url.searchParams.entries());
    const rows = (await listRows(table, { filters })).map(withPermissionCount);
    if (routeKey === "permissions") {
      return rows.reduce((groups, permission) => {
        const group = permission.group || "Other";
        groups[group] = [...(groups[group] || []), permission];
        return groups;
      }, {});
    }
    return rows;
  }
  if (method === "POST") return withPermissionCount(await createRow(table, parseBody(options)));
  if (method === "PUT" || method === "PATCH") {
    const body = parseBody(options);
    if (table === "users" && body.permissions) {
      body.effective_permissions = Object.entries(body.permissions)
        .filter(([, allowed]) => allowed)
        .map(([key]) => key);
      body.permission_overrides = body.permissions;
      delete body.permissions;
      delete body.password;
      delete body.password_confirmation;
    }
    return withPermissionCount(await updateRow(table, id, body));
  }
  if (method === "DELETE") { await deleteRow(table, id); return null; }
  throw Object.assign(new Error("Unsupported Supabase operation."), { status: 405 });
}

export const supabaseApiClient = {
  request,
  entities: {
    Client: clientEntity,
    Machine: makeEntity("machines"),
    ServiceRecord: makeEntity("service_records"),
    JobCard: makeEntity("job_cards"),
    JobCardLine: makeEntity("job_card_lines"),
    Site: makeEntity("sites"),
    User: makeEntity("users"),
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
        const optimizedFile = await optimizeImageForUpload(file);
        const path = `${userId}/${crypto.randomUUID()}-${optimizedFile.name}`;
        // "documents" is the closest generic bucket for arbitrary uploads today (no
        // dedicated permission/feature exists yet for this specific route -- see
        // 0004_storage_buckets.sql's comments). Revisit once a real caller/feature for
        // this route is identified.
        //
        // BUG FIX (2026-08-04): this previously called getPublicUrl() on a bucket that
        // 0004_storage_buckets.sql creates with `public: false` -- that returns a URL
        // that 400/403s when actually fetched, since Supabase only serves that URL shape
        // for genuinely public buckets. Switched to a signed URL instead, matching every
        // other private-bucket read path in this codebase.
        //
        // KNOWN LIMITATION, not fixed here (narrower than the bug above): Firebase's
        // getDownloadURL() (apiClient.js's equivalent) returns an effectively permanent
        // token URL that's safe to store in a record and reuse indefinitely. A Supabase
        // signed URL expires (7 days below) -- if a caller persists this `file_url` value
        // for long-term reuse rather than displaying it immediately, it will eventually
        // stop working. Whoever wires this route to a real page/field should either
        // re-sign on read instead of storing the URL, or store `path` and generate a fresh
        // signed URL each time it's needed. Not solved here since no caller exists yet.
        await uploadFile("documents", path, optimizedFile, { optimizeImage: false });
        const fileUrl = await getSignedUrl("documents", path, 60 * 60 * 24 * 7);
        return { file_url: fileUrl };
      },
    },
  },
  auth: {
    me: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Unauthenticated");
      return withPermissionCount(await loadUserProfile(userId));
    },
    logout: async () => { await supabaseSignOut(); window.location.href = "/login"; },
    resetPasswordRequest: async (email) => supabaseRequestPasswordReset(email, `${window.location.origin}/reset-password`),
    // See file header: assumes an active recovery session (via the emailed reset link),
    // not a raw exchangeable token like Firebase's confirmPasswordReset.
    resetPassword: async ({ newPassword }) => updatePassword(newPassword),
  },
};

// Referenced for parity with entities.js's KnowledgeBaseService/SiteService/etc. -- not
// yet wired into supabaseApiClient's routing above beyond what request() already covers.
// Kept as a named export so future callers migrating page-by-page can use the richer
// entity services directly instead of the generic request() router.
export { ClientService, MachineService, ServiceRecordService, JobCardService, JobCardLineService, SiteService, UserService, PermissionService, RolePermissionService, KnowledgeBaseService };
