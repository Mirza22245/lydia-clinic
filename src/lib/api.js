// Portabel frontend-klient för Lydia (Hostinger-bygget, VITE_USE_BASE44=false).
// Pratar med Lydias egen Express-backend; ingen Base44-SDK ingår i detta bygge.
// Täcker exakt de anrop appen använder: entities (filter/list/get/create/update/
// delete/count/aggregate), auth, integrations.Core (privata filer) och functions.invoke.
const API = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

class ApiError extends Error {
  constructor(status, data) {
    super((data && (data.error || data.message)) || 'Förfrågan misslyckades');
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }
}

async function http(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'X-Requested-With': 'fetch',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text }; } }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

function entityApi(name) {
  const base = `/entities/${encodeURIComponent(name)}`;
  const filter = (query = {}, opts = {}) => http(`${base}/filter`, { method: 'POST', body: { query, opts } });
  return {
    filter,
    list: (opts = {}) => filter({}, opts),
    get: (id) => http(`${base}/${encodeURIComponent(id)}`),
    create: (data) => http(base, { method: 'POST', body: data }),
    update: (id, data) => http(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
    delete: (id) => http(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    count: async (query = {}) => (await http(`${base}/count`, { method: 'POST', body: { query } })).count,
    aggregate: (opts) => http(`${base}/aggregate`, { method: 'POST', body: opts }),
    subscribe: () => () => {},
  };
}

const entities = new Proxy({}, { get: (_, name) => entityApi(String(name)) });

const auth = {
  me: () => http('/auth/me'),
  isAuthenticated: async () => { try { await http('/auth/me'); return true; } catch { return false; } },
  loginViaEmailPassword: (email, password) => http('/auth/login', { method: 'POST', body: { email, password } }),
  loginWithProvider: async (provider, returnTo = '/portal') => { if (provider !== 'google') throw new Error('Okänd inloggningsleverantör.'); window.location.href = `${API}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`; },
  register: ({ email, password }) => http('/auth/register', { method: 'POST', body: { email, password } }),
  verifyOtp: ({ email, otpCode }) => http('/auth/verify-otp', { method: 'POST', body: { email, otpCode } }),
  resendOtp: (email) => http('/auth/resend-otp', { method: 'POST', body: { email } }),
  adminInviteStaff: (data) => http('/auth/admin/staff-invite', { method: 'POST', body: data }),
  acceptStaffInvite: (token, password) => http('/auth/accept-invite', { method: 'POST', body: { token, password } }),
  resetPasswordRequest: (email) => http('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: ({ resetToken, newPassword }) => http('/auth/reset-password', { method: 'POST', body: { resetToken, newPassword } }),
  // Sessionen är en HttpOnly-cookie som servern sätter; ingen token hanteras i webbläsaren.
  setToken: () => {},
  updateMe: (data) => http('/auth/me', { method: 'PATCH', body: data }),
  async logout(redirectUrl) {
    await http('/auth/logout', { method: 'POST' });
    if (redirectUrl) window.location.href = redirectUrl; else window.location.reload();
  },
  redirectToLogin(nextUrl) {
    window.location.href = `/login${nextUrl ? `?returnTo=${encodeURIComponent(nextUrl)}` : ''}`;
  },
};

const integrations = {
  Core: {
    async UploadPrivateFile({ file }) {
      const form = new FormData();
      form.append('file', file);
      return http('/files/upload', { method: 'POST', form });
    },
    CreateFileSignedUrl: ({ file_uri }) => http(`/files/sign?uri=${encodeURIComponent(file_uri)}`),
  },
};

// Samma form som Base44-wrappern: { data, status } (anropare läser res.data).
const functions = {
  async invoke(name, payload = {}) {
    const path = name === 'getAvailableSlots' ? '/availability' : name === 'createPublicBooking' ? '/public-booking' : `/functions/${encodeURIComponent(name)}`;
    const data = await http(path, { method: 'POST', body: payload });
    return { data, status: 200 };
  },
};

const app = { getPublicSettings: async () => ({ id: 'lydia', public_settings: {} }) };

export const base44 = { entities, auth, integrations, functions, app };