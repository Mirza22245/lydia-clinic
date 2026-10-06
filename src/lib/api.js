// Frontend API-abstraktionslager — gör Base44→egen backend byte mekaniskt.
// När USE_BASE44=false, anropar denna egen backend istället för @base44/sdk.
// Detta är nyckeln till portabilitet: 38+ filer behöver inte skrivas om,
// bara denna fil byter implementering.

const USE_BASE44 = import.meta.env.VITE_USE_BASE44 !== "false";
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// --- Base44-implementering (nuvarande) ---
import { base44 as base44Client } from "@/api/base44Client";

// --- Egen backend-implementering ---
const portableApi = {
  entities: new Proxy(
    {},
    {
      get(_, entityName) {
        return {
          filter: async (query, opts) => {
            const params = new URLSearchParams({ ...query, ...opts });
            const res = await fetch(`${API_BASE}/${entityName.toLowerCase()}?${params}`, {
              headers: authHeaders(),
            });
            const data = await res.json();
            return { items: data.items || data, has_more: data.has_more };
          },
          get: async (id) => {
            const res = await fetch(`${API_BASE}/${entityName.toLowerCase()}/${id}`, {
              headers: authHeaders(),
            });
            return res.json();
          },
          create: async (data) => {
            const res = await fetch(`${API_BASE}/${entityName.toLowerCase()}`, {
              method: "POST",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            return res.json();
          },
          update: async (id, data) => {
            const res = await fetch(`${API_BASE}/${entityName.toLowerCase()}/${id}`, {
              method: "PUT",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            return res.json();
          },
          delete: async (id) => {
            const res = await fetch(`${API_BASE}/${entityName.toLowerCase()}/${id}`, {
              method: "DELETE",
              headers: authHeaders(),
            });
            return res.json();
          },
          count: async (query) => {
            const params = new URLSearchParams({ ...query, _count: "true" });
            const res = await fetch(`${API_BASE}/${entityName.toLowerCase()}?${params}`, {
              headers: authHeaders(),
            });
            const data = await res.json();
            return data.count || 0;
          },
        };
      },
    }
  ),
  auth: {
    me: async () => {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    isAuthenticated: async () => {
      try {
        await portableApi.auth.me();
        return true;
      } catch {
        return false;
      }
    },
    loginViaEmailPassword: async (email, password) => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      localStorage.setItem("lydia_token", data.token);
      return data;
    },
    logout: async () => {
      localStorage.removeItem("lydia_token");
      window.location.href = "/login";
    },
  },
  functions: {
    invoke: async (name, payload) => {
      const res = await fetch(`${API_BASE}/${name}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
  },
  integrations: {
    Core: {
      UploadPrivateFile: async ({ file }) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${API_BASE}/files/upload`, {
          method: "POST",
          headers: authHeaders(),
          body: formData,
        });
        return res.json();
      },
      CreateFileSignedUrl: async ({ file_uri }) => {
        const res = await fetch(`${API_BASE}/files/sign`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ file_uri }),
        });
        return res.json();
      },
      SendEmail: async (payload) => {
        return portableApi.functions.invoke("sendEmail", payload);
      },
    },
  },
};

function authHeaders() {
  const token = localStorage.getItem("lydia_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Exportera rätt implementering baserat på miljö
export const api = USE_BASE44 ? base44Client : portableApi;

// För bakåtkompatibilitet: om befintlig kod importerar { base44 } från @/api/base44Client,
// kan den byta till { api } från @/lib/api istället.
// Migrering: sök/ersätt "from '@/api/base44Client'" → "from '@/lib/api'" i alla filer.