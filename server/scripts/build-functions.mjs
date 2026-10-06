#!/usr/bin/env node
// Bygger om alla backend-funktioner (base44/functions/*/entry.ts) till ESM-
// moduler i server/.compiled-functions/ med esbuild, med en plugin som byter
// npm:@base44/sdk -> lokal SDK-shim och base44:runtime -> lokal secrets-shim.
// Detta gör att befintlig affärslogik (requirement engine, compliance, kvitto,
// SMS, BankID) körs ofändrad på Node/Express utan Base44-beroende.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, '../base44/functions');
const OUT = resolve(ROOT, '.compiled-functions');

const sdkShimPath = resolve(ROOT, 'src/runtime/sdk-shim.js');
const secretsShimPath = resolve(ROOT, 'src/runtime/secrets-shim.js');

const names = readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const plugin = {
  name: 'lydia-compat',
  setup(build) {
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
  });
}
console.log(`[build-functions] ${names.length} funktioner kompilerade till ${OUT}`);