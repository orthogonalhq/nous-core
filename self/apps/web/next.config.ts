import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@nous/ui',
    '@nous/shared',
    '@nous/shared-server',
    '@nous/subcortex-apps',
    '@nous/cortex-core',
    '@nous/cortex-pfc',
    '@nous/memory-access',
    '@nous/memory-distillation',
    '@nous/memory-ltm',
    '@nous/memory-stm',
    '@nous/memory-mwc',
    '@nous/subcortex-projects',
    '@nous/subcortex-router',
    '@nous/subcortex-providers',
    '@nous/subcortex-tools',
    '@nous/autonomic-embeddings',
    '@nous/autonomic-storage',
    '@nous/autonomic-config',
  ],
  webpack(config, { isServer, webpack }) {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    // WR-162 SP 10: alias `node:crypto` to a renderer-safe stub for the
    // browser bundle. `@nous/subcortex-opctl/src/confirmation.ts` imports
    // `randomUUID` + `createHash` at module top level for proof-issuance
    // helpers (`issueConfirmationProof`, `issueSystemProof`, `hashScope`).
    // The MAO recovery components in `@nous/ui` only consume the pure
    // tier helpers (`getRequiredTier`, `getTierDisplay`); routing the
    // top-level import through a renderer-safe stub lets webpack resolve
    // the bundle without breaking the proof-issuance helpers' server-side
    // contract (any accidental browser-side call throws at call time,
    // surfacing the contract defect rather than silently producing an
    // invalid proof). Server-side bundles continue to use the real
    // `node:crypto` module.
    if (!isServer) {
      const cryptoShim = path.resolve(
        __dirname,
        'shims/node-crypto-renderer.ts',
      );
      config.resolve.alias = {
        ...config.resolve.alias,
        'node:crypto': cryptoShim,
      };
      // Webpack 5 does not resolve `node:` URIs in browser bundles by
      // default; rewrite the literal `node:crypto` import to the shim.
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:crypto$/,
          cryptoShim,
        ),
      );
    }
    return config;
  },
};

export default nextConfig;
