const API_BASE_URL = "http://127.0.0.1:8000/api";

const endpointMap = {
  Client: "clients",
  Machine: "machines",
  ServiceRecord: "service-records",
  JobCard: "job-cards",
  JobCardLine: "job-card-lines",
  Site: "sites",
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

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
        method: "PUT",
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
  },

  auth: {
    me: async () => ({
      id: "local-user",
      email: "local@test.com",
      full_name: "Local User",
      role: "admin",
    }),

    login: async () => true,
    logout: async () => true,
  },
};