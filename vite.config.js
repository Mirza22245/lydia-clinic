import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const src = path.resolve(process.cwd(), 'src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/functions\/([A-Za-z0-9_]+)$/, replacement: path.join(src, 'lib/functions.js') },
      { find: /^@\/api\/base44Client$/, replacement: path.join(src, 'lib/api.js') },
      { find: /^@\/lib\/app-params$/, replacement: path.join(src, 'lib/app-params.portable.js') },
      { find: /^@\//, replacement: src + '/' },
    ],
  },
});
