import { Router } from 'express';
import { getEntity, QueryError } from './registry.js';
import { makeStore } from './store.js';
import { loadUser } from '../auth/session.js';
import { isPlatformAdmin, getStaffRole } from './user-context.js';
import { audit } from '../lib/audit.js';

export const entityRouter = Router();

// CSRF-skydd för state-changing requests från webbläsare.
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && req.headers['x-requested-with'] !== 'fetch' && !req.headers['x-csrf-token']) {
    // tillåt same-origin (origin matchar host) utan token
    const host = req.headers.host;
    if (origin && host && !origin.includes(host)) {
      return res.status(403).json({ error: 'Cross-origin request nekad' });
    }
  }
  next();
}

entityRouter.use(csrfGuard);

// POST /api/entities/:name/filter  { query, opts }
entityRouter.post('/:name/filter', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    const { query = {}, opts = {} } = req.body || {};
    const result = await store.filter(query, opts);
    res.json(result);
  } catch (e) { handleError(res, e); }
});

entityRouter.get('/:name/:id', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    res.json(await store.get(req.params.id));
  } catch (e) { handleError(res, e); }
});

entityRouter.post('/:name', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    res.status(201).json(await store.create(req.body || {}));
  } catch (e) { handleError(res, e); }
});

entityRouter.patch('/:name/:id', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    res.json(await store.update(req.params.id, req.body || {}));
  } catch (e) { handleError(res, e); }
});

entityRouter.delete('/:name/:id', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    res.json(await store.delete(req.params.id));
  } catch (e) { handleError(res, e); }
});

entityRouter.post('/:name/count', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    res.json({ count: await store.count((req.body || {}).query || {}) });
  } catch (e) { handleError(res, e); }
});

entityRouter.post('/:name/aggregate', async (req, res) => {
  try {
    const user = await loadUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const entity = getEntity(req.params.name);
    const store = makeStore(entity.name, { user, bypass: isPlatformAdmin(user) });
    if (!store || typeof store.filter !== 'function' || typeof store.get !== 'function' || typeof store.count !== 'function' || typeof store.aggregate !== 'function') {
      throw new QueryError(`Entity store kunde inte initieras: ${entity.name}`, 500);
    }
    res.json(await store.aggregate(req.body || {}));
  } catch (e) { handleError(res, e); }
});

function handleError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error('[entities]', e);
  res.status(status).json({ error: e.message || 'Serverfel' });
}