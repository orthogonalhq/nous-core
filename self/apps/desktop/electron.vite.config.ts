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
        // WR-162 SP 10: alias `node:crypto` to a renderer-safe stub.
        // `@nous/subcortex-opctl/src/confirmation.ts` imports
        // `randomUUID` + `createHash` at module top level for the
        // proof-issuance helpers (`issueConfirmationProof`,
        // `issueSystemProof`, `hashScope`); those helpers run only on
        // the server side. The MAO recovery components added in SP 10
        // (`RecoveryStateBanner`, `RecoveryReviewRequiredActions`,
        // `RecoveryHardStopActions`) consume only the pure tier helpers
        // (`getRequiredTier`, `getTierDisplay`) and the
        // `ConfirmationTierDisplay` type — never the proof-issuance
        // helpers. The stub exports `randomUUID` (Web Crypto-backed) +
        // `createHash` (throws on call) so module-load succeeds in the
        // browser; any accidental renderer-side proof issuance would
        // throw at call time, surfacing the contract defect rather than
        // silently producing an invalid proof.
        'node:crypto': path.resolve(
          __dirname,
          'src/renderer/src/shims/node-crypto-renderer.ts',
        ),
      },
    },
  },
})
