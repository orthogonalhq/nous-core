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
  ssr: {
    noExternal: true,
  },
  build: {
    target: 'node22',
    outDir: 'out/server',
    ssr: path.resolve(__dirname, 'server/main.ts'),
    rollupOptions: {
      external: [
        /^node:/,
        /^better-sqlite3/,
      ],
      output: {
        entryFileNames: 'main.js',
        format: 'cjs',
      },
    },
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
  },
  resolve: {
    conditions: ['node'],
  },
});
