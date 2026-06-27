// Defines which roles can access which nav routes
// Defines which roles can access which nav routes
export const ROLE_LABELS = {
  admin: "Admin",
  technician: "Technician",
  accountant: "Accountant",
};

export const ROLE_COLORS = {
  admin: "bg-red-500/15 text-red-400",
  technician: "bg-blue-500/15 text-blue-400",
  accountant: "bg-emerald-500/15 text-emerald-400",
};

export const ROLE_NAV_ACCESS = {
  admin: [
    "/",
    "/clients",
    "/upcoming-services",
    "/book-in",
    "/jobs",
    "/invoice-queue",
    "/admin/users",
  ],

  technician: [
    "/",
    "/clients",
    "/upcoming-services",
    "/book-in",
    "/jobs",
  ],

  accountant: [
    "/",
    "/clients",
    "/jobs",
    "/invoice-queue",
  ],
};

export const ROLE_CAPABILITIES = {
  admin: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canManageUsers: true,
    canBookIn: true,
    canUpdateJobs: true,
    canInvoice: true,
  },

  technician: {
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canManageUsers: false,
    canBookIn: true,
    canUpdateJobs: true,
    canInvoice: false,
  },

  accountant: {
    canCreate: false,
    canEdit: true,
    canDelete: false,
    canManageUsers: false,
    canBookIn: false,
    canUpdateJobs: false,
    canInvoice: true,
  },
};