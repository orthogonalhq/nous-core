/**
 * Vite config for building the desktop backend server (child process).
 *
 * This is a separate build from electron-vite's main/preload/renderer.
 * The server runs as a standalone Node.js process spawned by the
 * Electron main process.
 */
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'out/server',
    lib: {
      entry: path.resolve(__dirname, 'server/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        /^node:/,
        /^@nous\//,
        /^@trpc\//,
        /^superjson/,
        /^better-sqlite3/,
        /^json5/,
        /^semver/,
        /^zod/,
        /^yaml/,
      ],
    },
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
  },
  resolve: {
    conditions: ['node'],
  },
});
