#!/usr/bin/env node
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
  .filter((d) => d.isDirectory() && d.name !== 'exportAllData')
  .map((d) => d.name);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'runtime'), { recursive: true });

const sdkOut = join(OUT, 'runtime', 'sdk-shim.js');
let sdkSource = readFileSync(sdkShimPath, 'utf8');
sdkSource = sdkSource
  .replaceAll("'../entities/index.js'", "'../../src/entities/index.js'")
  .replaceAll("'../entities/store.js'", "'../../src/entities/store.js'")
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
    build.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: sdkShimPath, external: true }));
    build.onResolve({ filter: /^base44:runtime$/ }, () => ({ path: secretsShimPath, external: true }));
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
    banner: { js: 'globalThis.Deno ??= { env: { get: (k) => process.env[k] } };' },
  });

  const outfile = join(OUT, `${name}.mjs`);
  let compiled = readFileSync(outfile, 'utf8');
  compiled = compiled.replace(/(?:[A-Za-z]:)?[^\n"' ]*\/server\/src\/runtime\/sdk-shim\.js/g, './runtime/sdk-shim.js');
  compiled = compiled.replace(/(?:[A-Za-z]:)?[^\n"' ]*\/server\/src\/runtime\/secrets-shim\.js/g, './runtime/secrets-shim.js');
  writeFileSync(outfile, compiled);
}
console.log(`[build-functions] ${names.length} funktioner kompilerade till ${OUT}`);
