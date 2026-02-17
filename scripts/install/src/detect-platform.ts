/**
 * Platform detection for Nous installer.
 * Detects OS and architecture for display and platform-specific install steps.
 */
export type Platform = 'darwin' | 'linux' | 'win32';

export interface PlatformInfo {
  platform: Platform;
  arch: string;
  display: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
};

const ARCH_ALIASES: Record<string, string> = {
  x64: 'x64',
  x86_64: 'x64',
  amd64: 'x64',
  arm64: 'arm64',
  aarch64: 'arm64',
};

export function detectPlatform(): PlatformInfo {
  const rawPlatform = process.platform;
  const platform =
    rawPlatform === 'darwin' || rawPlatform === 'linux' || rawPlatform === 'win32'
      ? rawPlatform
      : 'linux';

  const rawArch = process.arch;
  const arch = ARCH_ALIASES[rawArch] ?? rawArch;

  const platformLabel = PLATFORM_LABELS[platform] ?? platform;
  const display = `${platformLabel} ${arch}`;

  return { platform, arch, display };
}
