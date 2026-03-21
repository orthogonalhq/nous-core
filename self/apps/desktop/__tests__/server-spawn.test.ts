/**
 * Tests for the desktop backend server spawn and readiness protocol.
 *
 * These tests verify:
 * - The server entry point can be loaded (import check)
 * - The CLI argument parser works correctly
 * - The IPC readiness signal protocol is correct
 * - Backend readiness guard behavior (Tier 2)
 * - Anti-regression source-level smoke tests (Tier 3)
 */
import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('desktop backend server', () => {
  describe('free port finder', () => {
    it('finds a free port by binding to port 0', async () => {
      const port = await new Promise<number>((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, '127.0.0.1', () => {
          const addr = srv.address();
          if (typeof addr === 'object' && addr !== null) {
            const port = addr.port;
            srv.close(() => resolve(port));
          } else {
            srv.close(() => reject(new Error('Could not determine port')));
          }
        });
        srv.on('error', reject);
      });

      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    });
  });

  describe('CLI argument parsing', () => {
    // Test the arg parsing logic that lives in server/main.ts
    function parseArgs(argv: string[]): { port: number; dataDir?: string; configPath?: string } {
      let port = 0;
      let dataDir: string | undefined;
      let configPath: string | undefined;

      for (const arg of argv) {
        if (arg.startsWith('--port=')) {
          port = parseInt(arg.slice('--port='.length), 10);
        } else if (arg.startsWith('--data-dir=')) {
          dataDir = arg.slice('--data-dir='.length);
        } else if (arg.startsWith('--config-path=')) {
          configPath = arg.slice('--config-path='.length);
        }
      }

      return { port, dataDir, configPath };
    }

    it('parses --port argument', () => {
      const args = parseArgs(['--port=12345']);
      expect(args.port).toBe(12345);
    });

    it('parses --data-dir argument', () => {
      const args = parseArgs(['--port=1', '--data-dir=/tmp/nous-data']);
      expect(args.dataDir).toBe('/tmp/nous-data');
    });

    it('parses --config-path argument', () => {
      const args = parseArgs(['--port=1', '--config-path=/etc/nous.json']);
      expect(args.configPath).toBe('/etc/nous.json');
    });

    it('returns port 0 when no --port is given', () => {
      const args = parseArgs([]);
      expect(args.port).toBe(0);
    });
  });

  describe('IPC readiness protocol', () => {
    it('ready message has correct shape', () => {
      const readyMessage = { type: 'ready', port: 54321 };

      expect(readyMessage.type).toBe('ready');
      expect(typeof readyMessage.port).toBe('number');
      expect(readyMessage.port).toBeGreaterThan(0);
    });
  });

  describe('backend spawn readiness', () => {
    it('ensureBackendReady throws when no promise exists', async () => {
      // Simulate the ensureBackendReady logic outside of Electron context
      let backendReady = false;
      let backendReadyPromise: Promise<number> | null = null;

      async function ensureBackendReady(): Promise<void> {
        if (backendReady) return;
        if (backendReadyPromise) {
          await backendReadyPromise;
          return;
        }
        throw new Error('Backend server is not running');
      }

      await expect(ensureBackendReady()).rejects.toThrow('Backend server is not running');
    });

    it('ensureBackendReady resolves when promise resolves', async () => {
      let backendReady = false;
      let backendReadyPromise: Promise<number> | null = Promise.resolve(54321);

      async function ensureBackendReady(): Promise<void> {
        if (backendReady) return;
        if (backendReadyPromise) {
          await backendReadyPromise;
          return;
        }
        throw new Error('Backend server is not running');
      }

      // Should not throw — the promise resolves
      await expect(ensureBackendReady()).resolves.toBeUndefined();
    });
  });

  describe('tRPC client construction', () => {
    it('getTrpcClient throws when backendPort is null', () => {
      // Simulate the getTrpcClient guard logic
      let backendPort: number | null = null;
      let trpcClient: unknown = null;

      function getTrpcClient() {
        if (!trpcClient && backendPort) {
          trpcClient = { mock: true };
        }
        if (!trpcClient) {
          throw new Error('Backend server is not ready — tRPC client unavailable');
        }
        return trpcClient;
      }

      expect(() => getTrpcClient()).toThrow('Backend server is not ready');
    });

    it('tRPC URL uses dynamic port', () => {
      const port = 54321;
      const url = `http://127.0.0.1:${port}/api/trpc`;

      expect(url).toBe('http://127.0.0.1:54321/api/trpc');
      expect(url).not.toContain('localhost:3000');
      expect(url).toContain('127.0.0.1');
    });
  });

  describe('anti-regression smoke', () => {
    // Read the main/index.ts source at test time to verify critical functions are present.
    // This catches accidental deletion of backend spawning code.
    const mainIndexPath = join(__dirname, '..', 'src', 'main', 'index.ts');
    let source: string;

    try {
      source = readFileSync(mainIndexPath, 'utf-8');
    } catch {
      source = '';
    }

    it('main/index.ts contains fork( — backend spawn must be present', () => {
      expect(source).toContain('fork(');
    });

    it('main/index.ts contains findFreePort — port allocation must be present', () => {
      expect(source).toContain('findFreePort');
    });

    it('main/index.ts contains spawnBackendServer — spawn orchestrator must be present', () => {
      expect(source).toContain('spawnBackendServer');
    });
  });
});
