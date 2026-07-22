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
import { callFunction } from "@/api/functionsClient";

const endpointMap = {
  Client: "clients",
  Machine: "machines",
  ServiceRecord: "service_records",
  JobCard: "job_cards",
  JobCardLine: "job_card_lines",
  Site: "sites",
  User: "users",
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

async function optimizeUpload(file) {
  if (!file.type.startsWith("image/")) return file;
  const maxEdge = 1920;
  const quality = 0.82;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Image compression failed.")),
      "image/webp",
      quality,
    ));
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch (error) {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("This picture could not be optimized. Please choose a JPEG, PNG or WebP image under 8 MB.", { cause: error });
    }
    return file;
  }
}

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

async function calendarEvents(searchParams) {
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const includeServices = searchParams.get("include_services") !== "0";
  const includeGoogle = searchParams.get("include_google") === "1";

  let events = [];
  const warnings = [];

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

  if (includeGoogle) {
    try {
      const googleParams = new URLSearchParams();
      if (start) googleParams.set("start", start);
      if (end) googleParams.set("end", end);
      const googleResult = await callFunction("googleCalendarEvents", { searchParams: googleParams });
      events = events.concat(googleResult?.events || []);
      if (Array.isArray(googleResult?.warnings)) warnings.push(...googleResult.warnings);
    } catch (error) {
      console.error("Failed to load Google Calendar events", error);
      warnings.push("Google Calendar is unavailable. Upcoming Services are still shown.");
    }
  }

  return { events, warnings };
}

const googleCalendarFunctionMap = {
  status: { GET: "googleCalendarStatus" },
  connect: { GET: "googleCalendarConnect" },
  calendars: { GET: "googleCalendarListCalendars", PUT: "googleCalendarSelectCalendars", POST: "googleCalendarSelectCalendars" },
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
  return callFunction(functionName, { method: functionName === "googleCalendarDisconnect" ? "DELETE" : "GET" });
}

async function request(path, options = {}) {
  if (!auth.currentUser) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
  const method = (options.method || "GET").toUpperCase();
  const url = new URL(path, "https://cap.local");
  const segments = url.pathname.replace(/^\//, "").split("/").filter(Boolean);

  if (segments[0] === "me") return apiClient.auth.me();
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

export const apiClient = {
  request,
  entities: {
    Client: clientEntity,
    Machine: machineEntity,
    ServiceRecord: makeEntity("ServiceRecord"),
    JobCard: makeEntity("JobCard"),
    JobCardLine: makeEntity("JobCardLine"),
    Site: makeEntity("Site"),
    User: makeEntity("User"),
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
