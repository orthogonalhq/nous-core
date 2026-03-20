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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const instanceRoot = join(tmpdir(), `nous-cli-instance-${randomUUID()}`);

  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-cli-e2e-${randomUUID()}`);
    process.env.NOUS_INSTANCE_ROOT = instanceRoot;
    mkdirSync(join(instanceRoot, '.apps'), { recursive: true });
    mkdirSync(join(instanceRoot, '.skills'), { recursive: true });
    mkdirSync(join(instanceRoot, '.workflows'), { recursive: true });
    mkdirSync(join(instanceRoot, '.projects'), { recursive: true });
    mkdirSync(join(instanceRoot, '.contracts'), { recursive: true });
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

  it('CLI pkg discover prints advisory suggestions from the marketplace router', async () => {
    const ctx = createNousContext();
    await ctx.registryService.applyGovernanceAction({
      action_type: 'verify_maintainer',
      maintainer_id: 'maintainer:1',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_verification_state: 'verified_individual',
      approval_evidence_ref: 'approval:1',
      evidence_refs: ['approval:1'],
    });
    await ctx.registryService.submitRelease({
      package_id: 'pkg.persona-engine',
      package_type: 'project',
      display_name: 'Persona Engine',
      package_version: '1.0.0',
      origin_class: 'third_party_external',
      registered: true,
      signing_key_id: 'key-1',
      signature_set_ref: 'sigset-1',
      source_hash: 'sha256:abc123',
      compatibility: {
        api_contract_range: '^1.0.0',
        capability_manifest: ['model.invoke'],
        migration_contract_version: '1',
        data_schema_versions: ['1'],
        policy_profile_defaults: [],
      },
      metadata_chain: {
        root_version: 1,
        timestamp_version: 1,
        snapshot_version: 1,
        targets_version: 1,
        trusted_root_key_ids: ['root-a'],
        delegated_key_ids: [],
        metadata_expires_at: '2027-03-12T00:00:00.000Z',
        artifact_digest: 'sha256:abc123',
        metadata_digest: 'sha256:def456',
      },
      maintainer_ids: ['maintainer:1'],
      published_at: new Date().toISOString(),
    });
    await ctx.nudgeDiscoveryService.recordSignal({
      signal_type: 'workflow_friction',
      target_scope: 'project',
      source_refs: ['persona'],
      evidence_refs: [{ actionCategory: 'trace-persist' }],
    });

    const cliPath = join(__dirname, '../../dist/cli.js');
    const proc = spawn('node', [cliPath, 'pkg', 'discover', '--signal', 'persona', '--api-url', baseUrl], {
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
    expect(out).toContain('pkg.persona-engine');
    expect(out).toContain('dismiss_once');
  });

  it('CLI pkg install routes through the canonical install pipeline', async () => {
    const ctx = createNousContext();
    const projectId = '550e8400-e29b-41d4-a716-446655445499';
    const sourceDir = join(instanceRoot, 'src-persona-engine');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'payload.txt'), 'persona-engine', 'utf-8');

    await ctx.registryService.applyGovernanceAction({
      action_type: 'verify_maintainer',
      maintainer_id: 'maintainer:install',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_verification_state: 'verified_individual',
      approval_evidence_ref: 'approval:install',
      evidence_refs: ['approval:install'],
    });
    await ctx.registryService.submitRelease({
      project_id: projectId as any,
      package_id: 'pkg.persona-engine',
      package_type: 'project',
      display_name: 'Persona Engine',
      package_version: '1.0.0',
      origin_class: 'third_party_external',
      registered: true,
      signing_key_id: 'key-install',
      signature_set_ref: 'sigset-install',
      source_hash: 'sha256:persona',
      compatibility: {
        api_contract_range: '^1.0.0',
        capability_manifest: ['model.invoke'],
        migration_contract_version: '1',
        data_schema_versions: ['1'],
        policy_profile_defaults: [],
      },
      metadata_chain: {
        root_version: 1,
        timestamp_version: 1,
        snapshot_version: 1,
        targets_version: 1,
        trusted_root_key_ids: ['root-a'],
        delegated_key_ids: [],
        metadata_expires_at: '2027-03-12T00:00:00.000Z',
        artifact_digest: 'sha256:persona',
        metadata_digest: 'sha256:persona-meta',
      },
      install_source_path: sourceDir,
      maintainer_ids: ['maintainer:install'],
      published_at: new Date().toISOString(),
    });

    const cliPath = join(__dirname, '../../dist/cli.js');
    const proc = spawn(
      'node',
      [
        cliPath,
        'pkg',
        'install',
        'pkg.persona-engine',
        '--project',
        projectId,
        '--api-url',
        baseUrl,
      ],
      {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const stdout: Buffer[] = [];
    proc.stdout?.on('data', (d) => stdout.push(d));

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 0));
    });

    const out = Buffer.concat(stdout).toString('utf-8');
    expect(exitCode).toBe(0);
    expect(out).toContain('Installed pkg.persona-engine');
    expect(
      readFileSync(
        join(instanceRoot, '.workflows', 'pkg.persona-engine', 'payload.txt'),
        'utf-8',
      ),
    ).toBe('persona-engine');
  });
});
