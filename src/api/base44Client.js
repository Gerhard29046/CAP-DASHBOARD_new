const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const endpointMap = {
  Client: "clients",
  Machine: "machines",
  ServiceRecord: "service-records",
  JobCard: "job-cards",
  JobCardLine: "job-card-lines",
  Site: "sites",
  User: "users",
};

function getAuthHeaders() {
  const token = localStorage.getItem("auth_token");

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("auth_token");
    window.location.href = "/login";
    throw new Error("Unauthenticated");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `API error: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function makeEntity(entityName) {
  const endpoint = endpointMap[entityName];

  return {
    list: async () => request(`/${endpoint}`),

    get: async (id) => request(`/${endpoint}/${id}`),

    create: async (data) =>
      request(`/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: async (id, data) =>
      request(`/${endpoint}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: async (id) =>
      request(`/${endpoint}/${id}`, {
        method: "DELETE",
      }),

    filter: async (conditions = {}) => {
      const allItems = await request(`/${endpoint}`);

      return allItems.filter((item) =>
        Object.entries(conditions).every(([key, value]) => item[key] === value)
      );
    },
  };
}

export const base44 = {
  entities: {
    Client: makeEntity("Client"),
    Machine: makeEntity("Machine"),
    ServiceRecord: makeEntity("ServiceRecord"),
    JobCard: makeEntity("JobCard"),
    JobCardLine: makeEntity("JobCardLine"),
    Site: makeEntity("Site"),
    User: makeEntity("User"),
  },

  auth: {
    me: async () => request("/me"),

    logout: async () => {
      try {
        await request("/logout", { method: "POST" });
      } catch {}
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    },
  },
};