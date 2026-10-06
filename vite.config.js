import path from 'node:path'
import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VITE_USE_BASE44=false => portabelt bygge för Hostinger: ingen Base44-plugin och
// ingen Base44-SDK i bundlen. Standard (builder/preview) är oförändrat.
const portable = process.env.VITE_USE_BASE44 === 'false';
const src = path.resolve(process.cwd(), 'src');

// Ersätter Base44-pluginens virtuella moduler "@/functions/<namn>" med anrop mot Lydias API.
const portableFunctions = () => ({
  name: 'lydia-portable-functions',
  enforce: 'pre',
  resolveId(id) {
    if (id.startsWith('lydia-fn:')) return '\0' + id;
    return null;
  },
  load(id) {
    if (!id.startsWith('\0lydia-fn:')) return null;
    const name = id.slice('\0lydia-fn:'.length);
    return [
      `import { base44 } from '@/lib/api';`,
      `export const ${name} = (payload) => base44.functions.invoke('${name}', payload);`,
      `export default ${name};`,
    ].join('\n');
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: portable
    ? [portableFunctions(), react()]
    : [
        base44({
          // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
          // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
          legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
          hmrNotifier: true,
          navigationNotifier: true,
          analyticsTracker: true,
          visualEditAgent: true
        }),
        react(),
      ],
  resolve: portable
    ? {
        alias: [
          { find: /^@\/functions\/([A-Za-z0-9_]+)$/, replacement: 'lydia-fn:$1' },
          { find: /^@\/api\/base44Client$/, replacement: path.join(src, 'lib/api.js') },
          { find: /^@\/lib\/app-params$/, replacement: path.join(src, 'lib/app-params.portable.js') },
          { find: /^@\//, replacement: src + '/' },
        ],
      }
    : undefined,
});