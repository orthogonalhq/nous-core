import type { NextConfig } from 'next';

const configuredDistDir = process.env.NOUS_NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  distDir: configuredDistDir || '.next',
  transpilePackages: [
    '@nous/ui',
    '@nous/shared',
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
  webpack(config) {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
