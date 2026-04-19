import path from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // No externalizeDepsPlugin — bundle all deps into main process.
    // pnpm's strict node_modules breaks electron-builder's dependency
    // resolution, so the main bundle must be self-contained.
    build: {
      rollupOptions: {
        external: ['koffi'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
        // Narrow alias for the personality sub-path: the renderer only needs
        // the personality registry/presets. Aliasing the full `@nous/cortex-core`
        // barrel would bundle Node-only surfaces (ingress, agent-gateway) that
        // fail at browser bundle time on `node:crypto`. The personality
        // sub-module is browser-safe.
        '@nous/cortex-core/personality': path.resolve(
          __dirname,
          '../../cortex/core/src/gateway-runtime/personality/index.ts',
        ),
      },
    },
  },
})
