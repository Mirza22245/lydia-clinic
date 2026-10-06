#!/usr/bin/env node
// Bygger om alla backend-funktioner (base44/functions/*/entry.ts) till ESM-
// moduler i server/.compiled-functions/ med esbuild, med en plugin som byter
// npm:@base44/sdk -> lokal SDK-shim och base44:runtime -> lokal secrets-shim.
// Detta gör att befintlig affärslogik (requirement engine, compliance, kvitto,
// SMS, BankID) körs ofändrad på Node/Express utan Base44-beroende.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, '../base44/functions');
const OUT = resolve(ROOT, '.compiled-functions');

const sdkShimPath = resolve(ROOT, 'src/runtime/sdk-shim.js');
const secretsShimPath = resolve(ROOT, 'src/runtime/secrets-shim.js');

const names = readdirSync(SRC, { withFileTypes: true })
  // exportAllData är en engångsfunktion för Base44-sidan och får aldrig exponeras i portabel drift.
  .filter((d) => d.isDirectory() && d.name !== 'exportAllData')
  .map((d) => d.name);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'runtime'), { recursive: true });
const sdkOut = join(OUT, 'runtime', 'sdk-shim.js');
let sdkSource = readFileSync(sdkShimPath, 'utf8');
sdkSource = sdkSource
  .replaceAll("'../entities/index.js'", "'../../src/entities/index.js'")
  .replaceAll("'../auth/session.js'", "'../../src/auth/session.js'")
  .replaceAll("'../lib/email.js'", "'../../src/lib/email.js'")
  .replaceAll("'../db/pool.js'", "'../../src/db/pool.js'")
  .replaceAll("'../routes/google.js'", "'../../src/routes/google.js'")
  .replaceAll("'../lib/storage.js'", "'../../src/lib/storage.js'");
writeFileSync(sdkOut, sdkSource);
copyFileSync(secretsShimPath, join(OUT, 'runtime', 'secrets-shim.js'));

const plugin = {
  name: 'lydia-compat',
  setup(build) {
    // Keep runtime shims external to avoid bundling CommonJS dependencies such as pg.
    // They are copied beside the compiled functions and referenced relatively.
    build.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: sdkShimPath, external: true }));
    build.onResolve({ filter: /^base44:runtime$/ }, () => ({ path: secretsShimPath, external: true }));
    // TS-filer i base44/shared importeras via relativa sökvägar — esbuild löser dem.
  },
};

for (const name of names) {
  const entry = join(SRC, name, 'entry.ts');
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: join(OUT, `${name}.mjs`),
    plugins: [plugin],
    logLevel: 'warning',
    // Några funktioner läser env via Deno.env.get — mappa till process.env i Node.
    banner: { js: 'globalThis.Deno ??= { env: { get: (k) => process.env[k] } };' },
  });
  const outfile = join(OUT, `${name}.mjs`);
  const compiled = readFileSync(outfile, 'utf8')
    .replaceAll(sdkShimPath, './runtime/sdk-shim.js')
    .replaceAll(secretsShimPath, './runtime/secrets-shim.js');
  writeFileSync(outfile, compiled);
}
console.log(`[build-functions] ${names.length} funktioner kompilerade till ${OUT}`);