/**
 * NodeRuntime — Cross-platform runtime abstraction implementing IRuntime.
 *
 * Handles platform-specific data directories, path resolution,
 * and environment detection for macOS, Linux, and Windows.
 */
import { dirname, join, resolve } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { access, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import type { IRuntime } from '@nous/shared';
import type { PlatformInfo } from '@nous/shared';

export class NodeRuntime implements IRuntime {
  private cachedDataDir: string | undefined;

  constructor() {
    const info = this.getPlatform();
    console.log(
      `[nous:runtime] Platform detected: os=${info.os}, arch=${info.arch}, node=${info.nodeVersion}`,
    );
  }

  resolvePath(...segments: string[]): string {
    return resolve(...segments);
  }

  getDataDir(): string {
    if (this.cachedDataDir) {
      return this.cachedDataDir;
    }

    const os = platform();
    let dir: string;

    switch (os) {
      case 'darwin':
        dir = join(homedir(), 'Library', 'Application Support', 'nous');
        break;

      case 'win32':
        dir = join(
          process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'),
          'nous',
        );
        break;

      default:
        // Linux and other Unix-like systems — follow XDG Base Directory spec
        dir = join(
          process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share'),
          'nous',
        );
        break;
    }

    this.cachedDataDir = dir;
    console.log(`[nous:runtime] Data directory resolved: ${dir}`);
    return dir;
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async copyDirectory(from: string, to: string): Promise<void> {
    await cp(from, to, { recursive: true, force: true });
  }

  async removePath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  async listDirectory(path: string): Promise<string[]> {
    return readdir(path);
  }

  getPlatform(): PlatformInfo {
    return {
      os: platform() as 'darwin' | 'linux' | 'win32',
      arch: arch(),
      nodeVersion: process.version,
    };
  }
}
