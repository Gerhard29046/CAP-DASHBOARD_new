import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  confirmPasswordReset,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { relatedRecords } from "@/lib/records";
import { optimizeImageForUpload } from "@/lib/imageOptimize";
import { supabaseApiClient } from "@/api/supabaseApiClient";

const endpointMap = {
  Client: "clients",
  Machine: "machines",
  ServiceRecord: "service_records",
  JobCard: "job_cards",
  JobCardLine: "job_card_lines",
  Site: "sites",
  User: "users",
  DashboardNote: "dashboard_notes",
};

const routeCollections = {
  clients: "clients",
  machines: "machines",
  "service-records": "service_records",
  "job-cards": "job_cards",
  "job-card-lines": "job_card_lines",
  users: "users",
  "admin/users": "users",
  "knowledge-machines": "knowledge_machines",
  "knowledge-notes": "knowledge_notes",
  "knowledge-service-codes": "knowledge_service_codes",
  "knowledge-media": "knowledge_media",
  "knowledge-documents": "knowledge_documents",
  permissions: "permissions",
};

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, clean(item)]));
  }
  return value;
}

function fromSnapshot(snapshot) {
  const record = { id: snapshot.id, ...clean(snapshot.data()) };
  if (Array.isArray(record.effective_permissions)) {
    record.effective_permission_count = record.effective_permissions.length;
  }
  return record;
}

function writeData(data, creating = false) {
  return {
    ...clean(data),
    updated_at: serverTimestamp(),
    ...(creating ? { created_at: serverTimestamp() } : {}),
  };
}

// Moved to frontend/src/lib/imageOptimize.js (2026-08-03) so the Supabase storage
// service can share identical upload-optimization behavior. Logic unchanged.
const optimizeUpload = optimizeImageForUpload;

async function listCollection(name, conditions = {}) {
  const filters = Object.entries(conditions).map(([field, value]) => where(field, "==", value));
  const source = filters.length ? query(collection(db, name), ...filters) : collection(db, name);
  const snapshot = await getDocs(source);
  return snapshot.docs.map(fromSnapshot);
}

async function getRecord(name, id) {
  const snapshot = await getDoc(doc(db, name, String(id)));
  if (!snapshot.exists()) throw Object.assign(new Error("Record not found."), { status: 404 });
  return fromSnapshot(snapshot);
}

async function createRecord(name, data) {
  const preferredId = data.id == null ? null : String(data.id);
  const payload = { ...data };
  delete payload.id;
  if (preferredId) {
    const target = doc(db, name, preferredId);
    await setDoc(target, writeData(payload, true));
    return getRecord(name, preferredId);
  }
  const target = await addDoc(collection(db, name), writeData(payload, true));
  return getRecord(name, target.id);
}

async function updateRecord(name, id, data) {
  await updateDoc(doc(db, name, String(id)), writeData(data));
  return getRecord(name, id);
}

async function deleteRecord(name, id) {
  await deleteDoc(doc(db, name, String(id)));
  return null;
}

function applyListOptions(items, sort, limit) {
  const result = [...items];
  if (sort) {
    const descending = sort.startsWith("-");
    const field = descending ? sort.slice(1) : sort;
    result.sort((a, b) => String(a[field] ?? "").localeCompare(String(b[field] ?? "")) * (descending ? -1 : 1));
  }
  return limit ? result.slice(0, limit) : result;
}

function makeEntity(entityName) {
  const collectionName = endpointMap[entityName];
  return {
    list: async (sort, limit) => applyListOptions(await listCollection(collectionName), sort, limit),
    get: async (id) => getRecord(collectionName, id),
    create: async (data) => createRecord(collectionName, data),
    update: async (id, data) => updateRecord(collectionName, id, data),
    delete: async (id) => deleteRecord(collectionName, id),
    filter: async (conditions = {}, sort, limit) =>
      applyListOptions(await listCollection(collectionName, conditions), sort, limit),
    subscribe: (conditions = {}, onData, onError, sort, limit) => {
      const filters = Object.entries(conditions).map(([field, value]) => where(field, "==", value));
      const source = filters.length ? query(collection(db, collectionName), ...filters) : collection(db, collectionName);
      return onSnapshot(source, (snapshot) => {
        onData(applyListOptions(snapshot.docs.map(fromSnapshot), sort, limit));
      }, onError);
    },
    watch: (id, onData, onError) => onSnapshot(doc(db, collectionName, String(id)), (snapshot) => {
      onData(snapshot.exists() ? fromSnapshot(snapshot) : null);
    }, onError),
  };
}

const clientEntity = makeEntity("Client");
const machineEntity = makeEntity("Machine");

clientEntity.get = async (id) => {
  const [client, machines] = await Promise.all([
    getRecord("clients", id),
    listCollection("machines"),
  ]);
  return { ...client, machines: relatedRecords(machines, "client_id", id) };
};

function parseBody(options) {
  if (!options.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

// Google Calendar sync was removed 2026-08-12 (user decision: Cloud Functions/Google API
// cost was not justified) -- this now only ever builds the CAP Dashboard's own "Upcoming
// Services" calendar from Firestore data directly. The `include_google`/`google_reason`
// wire shape is kept so CalendarPage.jsx's request doesn't need a matching rewrite, but no
// Google branch exists to populate it anymore.
async function calendarEvents(searchParams) {
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const includeServices = searchParams.get("include_services") !== "0";

  let events = [];
  const warnings = [];
  const googleReason = null;

  if (includeServices) {
    const [services, machines, clients] = await Promise.all([
      listCollection("service_records"),
      listCollection("machines"),
      listCollection("clients"),
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

  return { events, warnings, google_reason: googleReason };
}

async function request(path, options = {}) {
  if (!auth.currentUser) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
  const method = (options.method || "GET").toUpperCase();
  const url = new URL(path, "https://cap.local");
  const segments = url.pathname.replace(/^\//, "").split("/").filter(Boolean);

  if (segments[0] === "me") return apiClient.auth.me();
  if (segments[0] === "calendar" && segments[1] === "events") return calendarEvents(url.searchParams);
  if (segments[0] === "knowledge-machines" && segments[1] && segments[2]) {
    const childCollections = {
      notes: "knowledge_notes",
      media: "knowledge_media",
      documents: "knowledge_documents",
      "service-codes": "knowledge_service_codes",
    };
    const childCollection = childCollections[segments[2]];
    if (childCollection) {
      if (method === "GET") return listCollection(childCollection, { knowledge_machine_id: segments[1] });
      if (method === "POST") return createRecord(childCollection, {
        ...parseBody(options),
        knowledge_machine_id: segments[1],
      });
    }
  }
  if (segments[0] === "knowledge-service-codes" && segments[1] && segments[2] === "reveal") {
    const record = await getRecord("knowledge_service_codes", segments[1]);
    return { service_code: record.service_code };
  }
  if (segments[0] === "roles" && segments[1] === "permissions") {
    const rows = await listCollection("role_permissions");
    return Object.fromEntries(rows.map((row) => [row.role || row.id, row]));
  }
  if (segments[0] === "users" && segments[2] === "permissions") {
    const [profile, permissions, roleDefaults] = await Promise.all([
      getRecord("users", segments[1]),
      listCollection("permissions"),
      getRecord("role_permissions", (await getRecord("users", segments[1])).role),
    ]);
    const defaults = new Set(roleDefaults.permissions || []);
    const effective = new Set(profile.effective_permissions || []);
    const overrides = profile.permission_overrides || {};
    return {
      ...profile,
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
  const collectionName = routeCollections[routeKey];
  if (!collectionName) throw Object.assign(new Error(`Firebase route is not available: ${url.pathname}`), { status: 501 });

  if (method === "GET" && id) return getRecord(collectionName, id);
  if (method === "GET") {
    const rows = await listCollection(collectionName, Object.fromEntries(url.searchParams.entries()));
    if (routeKey === "permissions") {
      return rows.reduce((groups, permission) => {
        const group = permission.group || "Other";
        groups[group] = [...(groups[group] || []), permission];
        return groups;
      }, {});
    }
    return rows;
  }
  if (method === "POST") return createRecord(collectionName, parseBody(options));
  if (method === "PUT" || method === "PATCH") {
    const body = parseBody(options);
    if (collectionName === "users" && body.permissions) {
      body.effective_permissions = Object.entries(body.permissions)
        .filter(([, allowed]) => allowed)
        .map(([key]) => key);
      body.permission_overrides = body.permissions;
      delete body.permissions;
      delete body.password;
      delete body.password_confirmation;
    }
    return updateRecord(collectionName, id, body);
  }
  if (method === "DELETE") return deleteRecord(collectionName, id);
  throw Object.assign(new Error("Unsupported Firebase operation."), { status: 405 });
}

const firebaseApiClient = {
  request,
  entities: {
    Client: clientEntity,
    Machine: machineEntity,
    ServiceRecord: makeEntity("ServiceRecord"),
    JobCard: makeEntity("JobCard"),
    JobCardLine: makeEntity("JobCardLine"),
    Site: makeEntity("Site"),
    User: makeEntity("User"),
    // Personal dashboard sticky notes (2026-08-13, explicit user request). Scoped to the
    // signed-in user's own notes via `created_by` -- firestore.rules enforces this
    // server-side (dashboard_notes match block), the client-side `.filter({ created_by })`
    // call in Dashboard.jsx is a query optimization, not the security boundary.
    DashboardNote: makeEntity("DashboardNote"),
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const optimizedFile = await optimizeUpload(file);
        const objectRef = ref(storage, `uploads/${auth.currentUser.uid}/${crypto.randomUUID()}-${optimizedFile.name}`);
        await uploadBytes(objectRef, optimizedFile, { contentType: optimizedFile.type });
        return { file_url: await getDownloadURL(objectRef) };
      },
    },
  },
  auth: {
    me: async () => {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("Unauthenticated");
      return getRecord("users", firebaseUser.uid);
    },
    logout: async () => { await signOut(auth); window.location.href = "/login"; },
    resetPasswordRequest: async (email) => sendPasswordResetEmail(auth, email),
    resetPassword: async ({ resetToken, newPassword }) => confirmPasswordReset(auth, resetToken, newPassword),
  },
};

// Phase 3 (2026-08-06): route to whichever backend VITE_AUTH_BACKEND selects. Uses the SAME
// flag as frontend/src/lib/AuthContext.jsx -- a session and its data layer must always agree
// on which backend they're pointed at, since the two are never valid to mix (a Supabase
// session has no Firebase ID token for Firestore calls, and vice versa). Defaults to
// "firebase" -- unchanged production behavior unless this build-time env var is explicitly
// set to "supabase". A static import is safe here (unlike a top-level `await import()`,
// which esbuild's configured target doesn't support -- tried and reverted, see git history)
// because services/supabase/client.js's env-var fail-fast is itself lazy (deferred to first
// real Supabase call, not import time) -- so statically pulling in supabaseApiClient.js
// never risks crashing the default "firebase" backend even if Supabase env vars are ever
// missing in some environment. Every one of the 21 files that `import { apiClient } from
// "@/api/apiClient"` needs zero changes -- this is the only file that changes.
export const apiClient = import.meta.env.VITE_AUTH_BACKEND === "supabase"
  ? supabaseApiClient
  : firebaseApiClient;
