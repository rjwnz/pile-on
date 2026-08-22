import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/*
 * `@pile-on/core` is aliased straight at its TypeScript source rather than a
 * build output. The engine has no build step and needs none — Vite compiles it
 * as part of the app, so there is no build ordering to get wrong and HMR works
 * across the package boundary.
 */
const coreSrc = fileURLToPath(
  new URL('../../packages/core/src', import.meta.url),
);

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // Honour PORT so more than one dev server can run at once; Vite would
  // otherwise take 5173 and refuse to share it.
  server: {port: Number(process.env['PORT']) || 5173},
  resolve: {
    alias: {
      '@pile-on/core': coreSrc,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
