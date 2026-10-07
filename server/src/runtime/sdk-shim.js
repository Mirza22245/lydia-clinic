import { userClient } from '../entities/index.js';
import { makeStore } from '../entities/store.js';
import { loadUser } from '../auth/session.js';
import { pool } from '../db/pool.js';
import { getGoogleToken } from '../routes/google.js';

// Per-request context (användare + IP) — bundet till Request-objektet så att
// createClientFromRequest(req) kan hämta det synkront, precis som Base44 SDK.
const contexts = new WeakMap();

export function bindContext(req, user, ip) {
  contexts.set(req, { user, ip });
}
export function getContext(req) {
  return contexts.get(req) || { user: null, ip: null };
}

function normalizeUser(u) {
  if (!u) return null;
  return {
    ...u,
    clinic_id: u.clinic_id ?? u.data?.clinic_id ?? '',
    staff_role: u.staff_role ?? u.data?.staff_role ?? '',
  };
}

export function createClientFromRequest(req) {
  const { user, ip } = getContext(req);
  const u = normalizeUser(user);
  const client = u ? userClient(u) : { entities: new Proxy({}, { get: () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); } }) };
  const serviceEntities = new Proxy({}, {
    get: (_, name) => {
      const store = makeStore(String(name), { bypass: true });
      // Do not wrap the store itself in another Proxy. Some Node/runtime
      // combinations can reject a non-object Proxy target during request
      // handling. A plain object wrapper is sufficient here.
      const filter = async (...args) => {
        const result = await store.filter(...args);
        if (Array.isArray(result)) return { items: result, has_more: false, next_cursor: null };
        if (result && typeof result === 'object') {
          if (Array.isArray(result.items)) return result;
          if (Array.isArray(result.data)) return { ...result, items: result.data };
        }
        return { items: [], has_more: false, next_cursor: null };
      };
      return { ...store, filter };
    },
  });
  return {
    ...client,
    auth: {
      me: async () => u,
    },
    asServiceRole: {
      entities: serviceEntities,
      entity: (name) => makeStore(String(name), { bypass: true }),
      integrations: {
        Core: {
          SendEmail: async (args) => { const { sendMail } = await import('../lib/email.js'); return sendMail(args); },
          UploadPrivateFile: async ({ file }) => {
            const { saveFile } = await import('../lib/storage.js');
            const buf = Buffer.from(await file.arrayBuffer());
            const { validateMime } = await import('../lib/storage.js');
            const m = validateMime(buf);
            return { file_uri: saveFile({ buffer: buf, clinicId: u?.clinic_id || '_global', ext: m.ext }) };
          },
          CreateFileSignedUrl: async ({ file_uri }) => {
            const { signFileUri } = await import('../lib/storage.js');
            return { signed_url: signFileUri(file_uri) };
          },
        },
      },
      connectors: {
        getConnection: async (type) => {
          if (type === 'googlecalendar') {
            if (!u) throw Object.assign(new Error('Unauthorized'), { status: 401 });
            const tok = await getGoogleToken(u.id);
            if (!tok?.access_token) throw Object.assign(new Error('Google Calendar inte ansluten'), { status: 503 });
            return { accessToken: tok.access_token };
          }
          throw Object.assign(new Error('Connector inte ansluten'), { status: 503 });
        },
      },
    },
    _ip: ip,
  };
}