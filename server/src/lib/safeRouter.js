// Express 4 fångar inte avvisade async-handlers: ett databasfel i en route skulle annars ge en
// ohanterad promise-rejection och krascha hela processen. Detta omsluter alla handlers så att
// felet går till felhanteraren i index.js (svar 500, processen lever).
export function safeRouter(router) {
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
    const orig = router[m].bind(router);
    router[m] = (path, ...handlers) => orig(
      path,
      ...handlers.map((h) => (typeof h === 'function' && h.length < 4
        ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
        : h)),
    );
  }
  return router;
}