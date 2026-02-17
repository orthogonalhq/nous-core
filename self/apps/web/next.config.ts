import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
