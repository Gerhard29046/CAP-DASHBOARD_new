import { createRow, deleteRow, getRow, listRows, subscribeToTable, updateRow } from "@/services/supabase/database";

// Entity service layer (Phase 1). Mirrors the resource boundary already established by
// frontend/src/api/apiClient.js's endpointMap/routeCollections -- pages should call these
// services, never frontend/src/services/supabase/database.js or the Supabase client
// directly. Not wired into any page yet; apiClient.js still talks to Firebase exclusively.
//
// Table/column names here match the corrected supabase/migrations/0001_initial_schema.sql
// (verified 2026-08-03 against real component field usage in AddClient.jsx,
// MachineDetail.jsx, JobCardDetail.jsx, apiClient.js's calendarEvents()).

function makeService(table) {
  return {
    list: (options) => listRows(table, options),
    get: (id) => getRow(table, id),
    create: (values) => createRow(table, values),
    update: (id, values) => updateRow(table, id, values),
    remove: (id) => deleteRow(table, id),
    subscribe: (callback, filter) => subscribeToTable(table, callback, filter),
  };
}

export const ClientService = {
  ...makeService("clients"),
  listWithMachines: async (id) => {
    const client = await getRow("clients", id);
    const machines = await listRows("machines", { filters: { client_id: id } });
    return { ...client, machines };
  },
};

export const SiteService = makeService("sites");

export const MachineService = {
  ...makeService("machines"),
  listForClient: (clientId) => listRows("machines", { filters: { client_id: clientId } }),
};

export const ServiceRecordService = {
  ...makeService("service_records"),
  listForMachine: (machineId) => listRows("service_records", { filters: { machine_id: machineId } }),
  // Mirrors apiClient.js calendarEvents(): service records with a next_service_due date,
  // joined against machines/clients, drive the Calendar page's derived events. Callers
  // should do the machine/client join themselves via MachineService/ClientService until
  // a dedicated view/RPC replaces this (Phase 2+ consideration, not built yet).
  listUpcoming: () => listRows("service_records", {
    orderBy: { column: "next_service_due", ascending: true },
  }),
};

export const JobCardService = {
  ...makeService("job_cards"),
  listForClient: (clientId) => listRows("job_cards", { filters: { client_id: clientId } }),
  listForMachine: (machineId) => listRows("job_cards", { filters: { machine_id: machineId } }),
  listByStatus: (status) => listRows("job_cards", { filters: { status } }),
};

export const JobCardLineService = {
  ...makeService("job_card_lines"),
  listForJobCard: (jobCardId) => listRows("job_card_lines", { filters: { job_card_id: jobCardId } }),
};

export const KnowledgeBaseService = {
  machines: makeService("knowledge_machines"),
  notes: {
    ...makeService("knowledge_notes"),
    listForMachine: (knowledgeMachineId) => listRows("knowledge_notes", { filters: { knowledge_machine_id: knowledgeMachineId } }),
  },
  serviceCodes: {
    ...makeService("knowledge_service_codes"),
    listForMachine: (knowledgeMachineId) => listRows("knowledge_service_codes", { filters: { knowledge_machine_id: knowledgeMachineId } }),
  },
  media: {
    ...makeService("knowledge_media"),
    listForMachine: (knowledgeMachineId) => listRows("knowledge_media", { filters: { knowledge_machine_id: knowledgeMachineId } }),
  },
  documents: {
    ...makeService("knowledge_documents"),
    listForMachine: (knowledgeMachineId) => listRows("knowledge_documents", { filters: { knowledge_machine_id: knowledgeMachineId } }),
  },
};

export const UserService = makeService("users");
export const PermissionService = makeService("permissions");
export const RolePermissionService = makeService("role_permissions");
export const NotificationService = {
  ...makeService("notifications"),
  listForUser: (userId) => listRows("notifications", {
    filters: { user_id: userId },
    orderBy: { column: "created_at", ascending: false },
  }),
};
