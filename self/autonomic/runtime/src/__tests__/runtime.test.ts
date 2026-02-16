import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { NodeRuntime } from '../runtime.js';

const TEST_DIR = join(tmpdir(), 'nous-runtime-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('NodeRuntime', () => {
  describe('interface conformance', () => {
    it('implements all IRuntime methods', () => {
      const runtime = new NodeRuntime();
      expect(typeof runtime.resolvePath).toBe('function');
      expect(typeof runtime.getDataDir).toBe('function');
      expect(typeof runtime.exists).toBe('function');
      expect(typeof runtime.getPlatform).toBe('function');
    });
  });

  describe('resolvePath()', () => {
    it('returns an absolute path from relative segments', () => {
      const runtime = new NodeRuntime();
      const result = runtime.resolvePath('foo', 'bar', 'baz.txt');
      const { isAbsolute } = require('node:path');
      expect(isAbsolute(result)).toBe(true);
      expect(result).toContain('foo');
      expect(result).toContain('bar');
      expect(result).toContain('baz.txt');
    });

    it('handles absolute path as first segment', () => {
      const runtime = new NodeRuntime();
      const result = runtime.resolvePath(TEST_DIR, 'sub', 'file.txt');
      expect(result).toBe(join(TEST_DIR, 'sub', 'file.txt'));
    });
  });

  describe('getPlatform()', () => {
    it('returns valid PlatformInfo with os, arch, nodeVersion', () => {
      const runtime = new NodeRuntime();
      const info = runtime.getPlatform();
      expect(info).toHaveProperty('os');
      expect(info).toHaveProperty('arch');
      expect(info).toHaveProperty('nodeVersion');
    });

    it('os matches process.platform', () => {
      const runtime = new NodeRuntime();
      expect(runtime.getPlatform().os).toBe(platform());
    });

    it('nodeVersion matches process.version', () => {
      const runtime = new NodeRuntime();
      expect(runtime.getPlatform().nodeVersion).toBe(process.version);
    });
  });

  describe('exists()', () => {
    it('returns true for an existing file', async () => {
      const runtime = new NodeRuntime();
      const filePath = join(TEST_DIR, 'exists-test.txt');
      writeFileSync(filePath, 'hello', 'utf-8');
      expect(await runtime.exists(filePath)).toBe(true);
    });

    it('returns false for a non-existent path', async () => {
      const runtime = new NodeRuntime();
      expect(await runtime.exists(join(TEST_DIR, 'nope.txt'))).toBe(false);
    });
  });

  describe('getDataDir()', () => {
    it('returns a path ending with "nous"', () => {
      const runtime = new NodeRuntime();
      const dir = runtime.getDataDir();
      expect(dir).toMatch(/nous$/);
    });

    it('respects XDG_DATA_HOME env var on Linux', () => {
      const originalPlatform = process.platform;
      const originalEnv = process.env['XDG_DATA_HOME'];

      try {
        Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
        process.env['XDG_DATA_HOME'] = '/custom/data';

        const runtime = new NodeRuntime();
        const dir = runtime.getDataDir();
        // Use join() for platform-correct separator in the expectation
        expect(dir).toBe(join('/custom/data', 'nous'));
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
        if (originalEnv === undefined) {
          delete process.env['XDG_DATA_HOME'];
        } else {
          process.env['XDG_DATA_HOME'] = originalEnv;
        }
      }
    });

    it('respects APPDATA env var on Windows', () => {
      const originalPlatform = process.platform;
      const originalEnv = process.env['APPDATA'];

      try {
        Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
        process.env['APPDATA'] = 'C:\\Users\\Test\\AppData\\Roaming';

        const runtime = new NodeRuntime();
        const dir = runtime.getDataDir();
        expect(dir).toBe(join('C:\\Users\\Test\\AppData\\Roaming', 'nous'));
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
        if (originalEnv === undefined) {
          delete process.env['APPDATA'];
        } else {
          process.env['APPDATA'] = originalEnv;
        }
      }
    });

    it('uses Library/Application Support on macOS', () => {
      const originalPlatform = process.platform;

      try {
        Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });

        const runtime = new NodeRuntime();
        const dir = runtime.getDataDir();
        expect(dir).toMatch(/Library/);
        expect(dir).toMatch(/Application Support/);
        expect(dir).toMatch(/nous$/);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
      }
    });
  });
});
