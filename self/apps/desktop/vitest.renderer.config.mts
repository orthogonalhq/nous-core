import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      // Narrow alias for the personality sub-path: only this module is
      // renderer-safe (the full cortex-core barrel pulls Node-only surfaces).
      // Mirrors the electron-vite renderer alias.
      '@nous/cortex-core/personality': path.resolve(
        __dirname,
        '../../cortex/core/src/gateway-runtime/personality/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/renderer/src/test-setup.ts'],
    css: true,
  },
})
