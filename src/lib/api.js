// Portabel frontend-klient för Lydia. Används när VITE_USE_BASE44=false.
// Speglar den del av @base44/sdk som appen använder: entities (filter/list/get/
// create/update/delete/bulkCreate/bulkUpdate/updateMany/deleteMany/count/
// aggregate/upsert/subscribe), auth, integrations.Core (upload/sign),
// analytics, users.inviteUser samt functions.invoke.
import { appParams } from '@/lib/app-params';

const API = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

function err(status, msg) {
  const e = new Error(msg || 'Förfrågan misslyckades'); e.status = status; return e;
}

async function http(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include',
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw err(res.status, data?.error || (typeof data === 'string' ? data : undefined));
  return data;
}

function entityApi(name) {
  return {
    async filter(query = {}, opts = {}) {
      return http(`/entities/${name}/filter`, { method: 'POST', body: JSON.stringify({ query, opts }) });
    },
    async list(opts = {}) {
      return http(`/entities/${name}/list`, { method: 'POST', body: JSON.stringify({ opts }) });
    },
    async get(id) {
      return http(`/entities/${name}/get`, { method: 'POST', body: JSON.stringify({ id }) });
    },
    async create(data) {
      return http(`/entities/${name}/create`, { method: 'POST', body: JSON.stringify({ data }) });
    },
    async bulkCreate(items) {
      return http(`/entities/${name}/bulk-create`, { method: 'POST', body: JSON.stringify({ items }) });
    },
    async update(id, data) {
      return http(`/entities/${name}/update`, { method: 'POST', body: JSON.stringify({ id, data }) });
    },
    async bulkUpdate(items) {
      return http(`/entities/${name}/bulk-update`, { method: 'POST', body: JSON.stringify({ items }) });
    },
    async updateMany(query, update) {
      return http(`/entities/${name}/update-many`, { method: 'POST', body: JSON.stringify({ query, update }) });
    },
    async delete(id) {
      return http(`/entities/${name}/delete`, { method: 'POST', body: JSON.stringify({ id }) });
    },
    async deleteMany(query) {
      return http(`/entities/${name}/delete-many`, { method: 'POST', body: JSON.stringify({ query }) });
    },
    async count(query = {}) {
      return http(`/entities/${name}/count`, { method: 'POST', body: JSON.stringify({ query }) });
    },
    async aggregate(opts) {
      return http(`/entities/${name}/aggregate`, { method: 'POST', body: JSON.stringify({ opts }) });
    },
    async upsert(records, opts) {
      return http(`/entities/${name}/upsert`, { method: 'POST', body: JSON.stringify({ records, opts }) });
    },
    subscribe(handler) {
      // Portabel läge har ingen realtime-socket; returnera no-op unsubscribe.
      return () => {};
    },
  };
}

const ENTITIES = new Proxy({}, { get: (_, name) => entityApi(name) });

const auth = {
  me: () => http('/auth/me'),
  isAuthenticated: async () => { try { await http('/auth/me'); return true; } catch { return false; } },
  async loginViaEmailPassword(email, password) {
    const r = await http('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    return r;
  },
  async loginWithProvider(provider, fromUrl) {
    window.location.href = `${API}/auth/${provider}?return=${encodeURIComponent(fromUrl || window.location.pathname)}`;
  },
  async register({ email, password }) {
    return http('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  async verifyOtp({ email, otpCode }) {
    return http('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otpCode }) });
  },
  resendOtp(email) {
    return http('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) });
  },
  resetPasswordRequest(email) {
    return http('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },
  async resetPassword({ resetToken, newPassword }) {
    return http('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) });
  },
  async logout(redirectUrl) {
    await http('/auth/logout', { method: 'POST' });
    if (redirectUrl) window.location.href = redirectUrl;
    else window.location.reload();
  },
  async updateMe(data) {
    return http('/auth/me', { method: 'PATCH', body: JSON.stringify(data) });
  },
  redirectToLogin(nextUrl) {
    const next = nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : '';
    window.location.href = `/login${next}`;
  },
};

const integrations = {
  Core: {
    async UploadPrivateFile({ file }) {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`${API}/files/upload`, { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json(); if (!res.ok) throw err(res.status, data.error);
      return data;
    },
    async UploadPublicFile({ file }) {
      // Portabel drift har inga publika filer — allt privat, signat vid behov.
      return this.UploadPrivateFile({ file });
    },
    async CreateFileSignedUrl({ file_uri }) {
      const res = await fetch(`${API}/files/sign?uri=${encodeURIComponent(file_uri)}`, { credentials: 'include' });
      const data = await res.json(); if (!res.ok) throw err(res.status, data.error);
      return data;
    },
  },
};

const users = {
  async inviteUser(email, role) {
    return http('/auth/invite', { method: 'POST', body: JSON.stringify({ email, role }) });
  },
};

const analytics = {
  track({ eventName, properties }) {
    // Best-effort, brandbart.
    try { navigator.sendBeacon(`${API}/analytics/track`, JSON.stringify({ eventName, properties })); } catch {}
  },
};

const functions = {
  async invoke(name, payload) {
    return http(`/functions/${name}`, { method: 'POST', body: JSON.stringify(payload || {}) });
  },
};

export const base44 = {
  entities: ENTITIES,
  auth,
  integrations,
  users,
  analytics,
  functions,
  asServiceRole: { entities: ENTITIES, integrations, connectors: { getConnection: () => { throw err(503, 'Ej tillgängligt i portabelt läge'); } } },
};