/**
 * CLI E2E test — full flow through HTTP.
 * Starts a minimal tRPC HTTP server, runs CLI send command, asserts response.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createNousContext, clearNousContextCache } from '@nous/web/server/bootstrap';
import { appRouter } from '@nous/web/server/trpc/root';

function readBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

describe('CLI E2E', () => {
  let server: import('node:http').Server;
  let baseUrl: string;
  const testPort = 38472;

  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-cli-e2e-${randomUUID()}`);
    clearNousContextCache();

    server = createServer(async (req, res) => {
      const url = `http://localhost:${testPort}${req.url ?? '/'}`;
      const body = req.method !== 'GET' && req.method !== 'HEAD'
        ? await readBody(req)
        : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      }
      const fetchReq = new Request(url, {
        method: req.method ?? 'GET',
        headers,
        body: body?.length ? body : undefined,
      });
      const response = await fetchRequestHandler({
        endpoint: '/api/trpc',
        req: fetchReq,
        router: appRouter,
        createContext: () => createNousContext(),
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    });

    await new Promise<void>((resolve) => {
      server.listen(testPort, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${testPort}`;
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('CLI send displays response when backend is running', async () => {
    const cliPath = join(__dirname, '../../dist/cli.js');
    const proc = spawn('node', [cliPath, 'send', 'E2E test message', '--api-url', baseUrl], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    proc.stdout?.on('data', (d) => stdout.push(d));
    proc.stderr?.on('data', (d) => stderr.push(d));

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 0));
    });

    const out = Buffer.concat(stdout).toString('utf-8');
    expect(exitCode).toBe(0);
    expect(out).toBeTruthy();
    expect(out.length).toBeGreaterThan(0);
  });

  it('CLI witness verify generates a verification report', async () => {
    const cliPath = join(__dirname, '../../dist/cli.js');
    const proc = spawn('node', [cliPath, 'witness', 'verify', '--api-url', baseUrl], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout: Buffer[] = [];
    proc.stdout?.on('data', (d) => stdout.push(d));

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 0));
    });

    const out = Buffer.concat(stdout).toString('utf-8');
    expect(exitCode).toBe(0);
    expect(out).toContain('Verification report');
  });
});
