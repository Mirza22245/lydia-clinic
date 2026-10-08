import { userClient, serviceEntity } from '../../src/entities/index.js';
import { makeStore } from '../../src/entities/store.js';
import { loadUser } from '../../src/auth/session.js';
import { pool } from '../../src/db/pool.js';
import { getGoogleToken } from '../../src/routes/google.js';

// Per-request context (användare + IP) — bundet till Request-objektet så att
// createClientFromRequest(req) kan hämta det synkront, precis som Base44 SDK.
const contexts = new WeakMap();

export function bindContext(req, user, ip) {
  const ctx = { user, ip };
  contexts.set(req, ctx);
  // Samma Request delas med den kompilerade funktionen. Kontexten ligger
  // på Request-objektet så separata modulinstanser ser samma användare.
  req.__lydiaContext = ctx;
}
export function getContext(req) {
  return contexts.get(req) || req.__lydiaContext || { user: null, ip: null };
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
  // makeStore/serviceEntity already exposes the canonical Base44-compatible
  // filter/list/get API. Keep this boundary as a thin dynamic accessor only.
  const serviceEntities = new Proxy({}, {
    get: (_, name) => serviceEntity(String(name)),
  });
  return {
    ...client,
    auth: {
      me: async () => u,
    },
    asServiceRole: {
      entities: serviceEntities,
      entity: (name) => serviceEntity(String(name)),
      integrations: {
        Core: {
          SendEmail: async (args) => { const { sendMail } = await import('../../src/lib/email.js'); return sendMail(args); },
          UploadPrivateFile: async ({ file }) => {
            const { saveFile } = await import('../../src/lib/storage.js');
            const buf = Buffer.from(await file.arrayBuffer());
            const { validateMime } = await import('../../src/lib/storage.js');
            const m = validateMime(buf);
            return { file_uri: saveFile({ buffer: buf, clinicId: u?.clinic_id || '_global', ext: m.ext }) };
          },
          CreateFileSignedUrl: async ({ file_uri }) => {
            const { signFileUri } = await import('../../src/lib/storage.js');
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