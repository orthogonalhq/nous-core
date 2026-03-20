import path from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // No externalizeDepsPlugin — bundle all deps into main process.
    // pnpm's strict node_modules breaks electron-builder's dependency
    // resolution, so the main bundle must be self-contained.
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      },
    },
  },
})
