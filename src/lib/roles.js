export const ROLE_LABELS = {
  Admin: "Administrator",
  Technician: "Technician",
  Accountant: "Accountant",
};

export const ROLE_COLORS = {
  Admin: "bg-red-500/15 text-red-400",
  Technician: "bg-blue-500/15 text-blue-400",
  Accountant: "bg-emerald-500/15 text-emerald-400",
};

export const ROLE_NAV_ACCESS = {
  Admin: [
    "/",
    "/clients",
    "/upcoming-services",
    "/book-in",
    "/jobs",
    "/invoice-queue",
    "/admin/users",
  ],

  Technician: [
    "/",
    "/clients",
    "/upcoming-services",
    "/book-in",
    "/jobs",
  ],

  Accountant: [
    "/",
    "/clients",
    "/jobs",
    "/invoice-queue",
  ],
};

export const ROLE_CAPABILITIES = {
  Admin: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canManageUsers: true,
    canBookIn: true,
    canUpdateJobs: true,
    canInvoice: true,
  },

  Technician: {
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canManageUsers: false,
    canBookIn: true,
    canUpdateJobs: true,
    canInvoice: false,
  },

  Accountant: {
    canCreate: false,
    canEdit: true,
    canDelete: false,
    canManageUsers: false,
    canBookIn: false,
    canUpdateJobs: false,
    canInvoice: true,
  },
};