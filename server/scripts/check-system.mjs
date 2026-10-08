import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fail = (msg) => { console.error('[system-check] FAIL:', msg); process.exitCode = 1; };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const pkg = JSON.parse(read('package.json'));
for (const dep of ['@base44/sdk', '@base44/vite-plugin']) {
  if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) fail(`Unused Base44 runtime dependency remains: ${dep}`);
}

const entitiesDir = path.join(root, 'base44/entities');
const entityNames = new Set(fs.readdirSync(entitiesDir).filter(f => f.endsWith('.jsonc')).map(f => JSON.parse(fs.readFileSync(path.join(entitiesDir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')).name).filter(Boolean));

const sourceDirs = ['src/pages', 'src/components', 'src/hooks'];
const entityRefs = new Set();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const m of text.matchAll(/base44\.entities\.([A-Za-z0-9_]+)/g)) entityRefs.add(m[1]);
    }
  }
};
for (const dir of sourceDirs) if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir));
for (const name of entityRefs) if (!entityNames.has(name)) fail(`Frontend references missing entity: ${name}`);

const serverSyntaxFiles = [];
const serverSrc = path.join(root, 'server');
const scanNodeFiles = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanNodeFiles(full);
    else if (/\.(js|mjs)$/.test(entry.name) && !full.includes(path.sep + '.compiled-functions' + path.sep)) serverSyntaxFiles.push(full);
  }
};
scanNodeFiles(serverSrc);
for (const file of serverSyntaxFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    const detail = (check.stderr || check.stdout || '').trim().split('\\n').slice(-8).join('\\n');
    fail(`Node syntax error in ${path.relative(root, file)}\\n${detail}`);
  }
}

const requiredFiles = [
  'server/src/index.js',
  'server/src/entities/routes.js',
  'server/src/entities/store.js',
  'server/src/entities/registry.js',
  'server/src/auth/routes.js',
  'server/src/routes/nativeAvailability.js',
  'server/src/routes/nativePublicBooking.js',
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) fail(`Missing production file: ${file}`);

const index = read('server/src/index.js');
if (!index.includes("config.host") || !index.includes('app.listen')) fail('Server does not use configured host/port');
if (!index.includes("app.get('/api/ready'")) fail('Readiness endpoint is missing');
if (!index.includes("app.use('/api/google', publicLimiter")) fail('Google OAuth route is not rate-limited');
if (!index.includes("app.use('/api/public-booking-data', publicLimiter")) fail('Public booking data route is not rate-limited');
if (!index.includes('https://js.stripe.com') || !index.includes('https://api.stripe.com')) fail('Stripe CSP is incomplete');
const frameSrcCount = (index.match(/frameSrc:/g) || []).length;
if (frameSrcCount !== 1) fail(`Expected exactly one frameSrc CSP directive, found ${frameSrcCount}`);

const catalog = read('server/src/db/luxeCatalog.js');
const catalogRows = (catalog.match(/\['/g) || []).length;
if (catalogRows < 100) fail(`Expected at least 100 catalog treatments, found ${catalogRows}`);

if (!process.exitCode) console.log('[system-check] OK');
