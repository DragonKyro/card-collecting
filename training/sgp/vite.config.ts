// Bundles the Sushi Go! Party training entry points into plain Node ESM under
// training/sgp/dist/ — its own folder, so rebuilding the Sea Salt & Paper
// bundle (training/dist/, emptied on every build) never pulls the files out
// from under a running Sushi Go trainer or its background evals.

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
        'sgp-eval': here('./eval.ts'),
        'sgp-env': here('./env-server.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
      },
    },
  },
});
