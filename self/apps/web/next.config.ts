import type { NextConfig } from 'next';

const configuredDistDir = process.env.NOUS_NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  distDir: configuredDistDir || '.next',
  transpilePackages: [
    '@nous/shared',
    '@nous/cortex-core',
    '@nous/cortex-pfc',
    '@nous/memory-stm',
    '@nous/memory-mwc',
    '@nous/subcortex-projects',
    '@nous/subcortex-router',
    '@nous/subcortex-providers',
    '@nous/subcortex-tools',
    '@nous/autonomic-storage',
    '@nous/autonomic-config',
  ],
};

export default nextConfig;
