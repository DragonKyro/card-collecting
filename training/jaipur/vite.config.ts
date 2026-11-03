// Bundles the Jaipur training entry points into plain Node ESM under
// training/jaipur/dist/ — its own folder, so rebuilding another game's bundle
// (each is emptied on every build) never pulls the files out from under a
// running Jaipur trainer or its background evals.

import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('../..'),
  publicDir: false,
  logLevel: 'warn',
  resolve: {
    alias: { '@': here('../../src') },
  },
  build: {
    ssr: true,
    target: 'node20',
    outDir: here('./dist'),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        'jaipur-eval': here('./eval.ts'),
        'jaipur-env': here('./env-server.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
      },
    },
  },
});
