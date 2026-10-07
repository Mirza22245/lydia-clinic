import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const src = path.resolve(process.cwd(), 'src');

const portableFunctions = () => ({
  name: 'lydia-portable-functions',
  enforce: 'pre',
  resolveId(id) {
    if (id.startsWith('lydia-fn:')) return '\\0' + id;
    return null;
  },
  load(id) {
    if (!id.startsWith('\\0lydia-fn:')) return null;
    const name = id.slice('\\0lydia-fn:'.length);
    return [
      "import { base44 } from '@/lib/api';",
      `export const ${name} = (payload) => base44.functions.invoke('${name}', payload);`,
      `export default ${name};`,
    ].join('\\n');
  },
});

export default defineConfig({
  plugins: [portableFunctions(), react()],
  resolve: {
    alias: [
      { find: new RegExp('^@/functions/([A-Za-z0-9_]+)$'), replacement: 'lydia-fn:$1' },
      { find: /^@\/api\/base44Client$/, replacement: path.join(src, 'lib/api.js') },
      { find: /^@\/lib\/app-params$/, replacement: path.join(src, 'lib/app-params.portable.js') },
      { find: /^@\//, replacement: src + '/' },
    ],
  },
});
