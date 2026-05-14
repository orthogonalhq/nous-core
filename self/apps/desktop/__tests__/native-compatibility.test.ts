import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createNativeCompatibilityProbeSource,
  formatNativeCompatibilityDiagnostic,
  formatNativeCompatibilityFailure,
  getNativeCompatibilityDiagnostic,
  normalizeInvalidNativeCompatibilityCheck,
  normalizeNativeCompatibilityResult,
} from '../server/native-compatibility';

const __dirname = dirname(fileURLToPath(import.meta.url));
const startDevPath = resolve(__dirname, '..', 'scripts', 'start-dev.mjs');

async function importStartDev() {
  return import(`${startDevPath}?t=${Date.now()}-${Math.random()}`);
}

describe('desktop native compatibility launch contract', () => {
  it('checks better-sqlite3 with PATH node before spawning electron-vite', async () => {
    const startDev = await importStartDev();
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      stdout: `${JSON.stringify({
        ok: true,
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        nodeVersion: 'v22.0.0',
        nodeAbi: '127',
      })}\n`,
    }));

    const result = startDev.runNativeCompatibilityCheck({ spawnSyncImpl, cwd: 'S:/repo' });

    expect(result.ok).toBe(true);
    expect(result.diagnostic).toMatchObject({
      moduleName: 'better-sqlite3',
      runtime: 'PATH node',
      nodeVersion: 'v22.0.0',
      nodeAbi: '127',
    });
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      'node',
      ['-e', expect.stringContaining('require("better-sqlite3")')],
      expect.objectContaining({
        cwd: 'S:/repo',
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: undefined }),
      }),
    );
  });

  it('returns actionable diagnostics for simulated native ABI failures without rebuild side effects', async () => {
    const startDev = await importStartDev();
    const spawnSyncImpl = vi.fn(() => ({
      status: 1,
      stdout: `${JSON.stringify({
        ok: false,
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        nodeVersion: 'v24.0.0',
        nodeAbi: '137',
        errorCode: 'ERR_DLOPEN_FAILED',
        errorMessage: 'was compiled against NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 137.',
      })}\n`,
    }));

    const result = startDev.runNativeCompatibilityCheck({ spawnSyncImpl });

    expect(result.ok).toBe(false);
    expect(result.diagnostic).toMatchObject({
      moduleName: 'better-sqlite3',
      runtime: 'PATH node',
      nodeVersion: 'v24.0.0',
      nodeAbi: '137',
      errorCode: 'ERR_DLOPEN_FAILED',
      compiledAbi: '127',
      requiredAbi: '137',
    });
    expect(startDev.formatNativeCompatibilityFailure(result.diagnostic)).toContain(
      'Rebuild or reinstall better-sqlite3 with the PATH node runtime',
    );

    const probeSource = startDev.createNativeCompatibilityProbeSource();
    expect(probeSource).not.toContain('pnpm rebuild');
    expect(probeSource).not.toContain('npm install');
  });

  it('spawns electron-vite only through the checked launcher seam', async () => {
    const startDev = await importStartDev();
    const spawnImpl = vi.fn(() => ({ on: vi.fn() }));

    startDev.startElectronVite({ spawnImpl });

    expect(spawnImpl).toHaveBeenCalledWith(
      expect.stringContaining('electron-vite'),
      ['dev'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('classifies native addon failures only by bounded deterministic facts', () => {
    const error = Object.assign(
      new Error(
        'The module better_sqlite3.node was compiled against NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 137.',
      ),
      { code: 'ERR_DLOPEN_FAILED' },
    );

    const diagnostic = getNativeCompatibilityDiagnostic(error);

    expect(diagnostic).toMatchObject({
      moduleName: 'better-sqlite3',
      runtime: 'PATH node',
      errorCode: 'ERR_DLOPEN_FAILED',
      compiledAbi: '127',
      requiredAbi: '137',
    });
    expect(formatNativeCompatibilityDiagnostic(diagnostic!)).toContain('native compatibility diagnostic');
  });

  it('normalizes PATH node probe results with the shared bounded diagnostic contract', () => {
    const result = normalizeNativeCompatibilityResult({
      ok: false,
      moduleName: 'better-sqlite3',
      runtime: 'PATH node',
      nodeVersion: 'v24.0.0',
      nodeAbi: '137',
      errorCode: 'ERR_DLOPEN_FAILED',
      errorMessage: 'compiled against NODE_MODULE_VERSION 127 but requires NODE_MODULE_VERSION 137',
    });

    expect(result).toEqual({
      ok: false,
      diagnostic: {
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        nodeVersion: 'v24.0.0',
        nodeAbi: '137',
        errorCode: 'ERR_DLOPEN_FAILED',
        compiledAbi: '127',
        requiredAbi: '137',
        remediation: 'Rebuild or reinstall better-sqlite3 with the PATH node runtime before launching the desktop app.',
      },
    });
    expect(formatNativeCompatibilityFailure(result.diagnostic)).toContain(
      '[nous:desktop] native compatibility check failed for better-sqlite3',
    );
  });

  it('fails closed for malformed successful native compatibility probe output', () => {
    expect(normalizeNativeCompatibilityResult({ ok: true })).toMatchObject({
      ok: false,
      diagnostic: {
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        errorCode: 'INVALID_PROBE_OUTPUT',
      },
    });
  });

  it('fails closed for successful probe output with mismatched identity fields', () => {
    expect(
      normalizeNativeCompatibilityResult({
        ok: true,
        moduleName: 'some-other-addon',
        runtime: 'PATH node',
        nodeVersion: 'v24.0.0',
        nodeAbi: '137',
      }),
    ).toMatchObject({
      ok: false,
      diagnostic: {
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        nodeVersion: 'v24.0.0',
        nodeAbi: '137',
        errorCode: 'INVALID_PROBE_OUTPUT',
      },
    });

    expect(
      normalizeNativeCompatibilityResult({
        ok: true,
        moduleName: 'better-sqlite3',
        runtime: 'Electron node',
        nodeVersion: 'v24.0.0',
        nodeAbi: '137',
      }),
    ).toMatchObject({
      ok: false,
      diagnostic: {
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        nodeVersion: 'v24.0.0',
        nodeAbi: '137',
        errorCode: 'INVALID_PROBE_OUTPUT',
      },
    });
  });

  it('fails closed for invalid native compatibility probe output', () => {
    expect(
      normalizeInvalidNativeCompatibilityCheck(
        'INVALID_PROBE_OUTPUT',
        'The better-sqlite3 compatibility check produced an invalid diagnostic result.',
      ),
    ).toMatchObject({
      ok: false,
      diagnostic: {
        moduleName: 'better-sqlite3',
        runtime: 'PATH node',
        errorCode: 'INVALID_PROBE_OUTPUT',
      },
    });
  });

  it('does not classify unrelated dlopen or generic text failures as native ABI authority', () => {
    const unrelatedDlopen = Object.assign(new Error('some other native addon failed'), {
      code: 'ERR_DLOPEN_FAILED',
    });
    const genericText = Object.assign(new Error('better-sqlite3 failed without dlopen code'), {
      code: 'SOME_OTHER_ERROR',
    });

    expect(getNativeCompatibilityDiagnostic(unrelatedDlopen)).toBeNull();
    expect(getNativeCompatibilityDiagnostic(genericText)).toBeNull();
  });

  it('keeps the backend restart predicate and externalization contract visible in source', () => {
    const mainSource = readFileSync(resolve(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
    const buildTestSource = readFileSync(resolve(__dirname, 'build-output.test.ts'), 'utf8');

    expect(mainSource).toContain('!options.appQuitting && options.exitCode !== 0 && !options.nativeCompatibilityFailure');
    expect(mainSource).toContain('execPath: systemNode');
    expect(buildTestSource).toContain('keeps better-sqlite3 external in the server bundle');
  });

  it('checks native compatibility at the backend spawn boundary before child assignment', () => {
    const mainSource = readFileSync(resolve(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

    const compatibilityIndex = mainSource.indexOf('await runBackendNativeCompatibilityCheck(systemNode)');
    const forkIndex = mainSource.indexOf('child = fork(serverPath, args');
    const childAssignmentIndex = mainSource.indexOf('backendChild = child');
    const registerChildIndex = mainSource.indexOf('registerChild(child.pid)', compatibilityIndex);

    expect(compatibilityIndex).toBeGreaterThan(-1);
    expect(forkIndex).toBeGreaterThan(compatibilityIndex);
    expect(childAssignmentIndex).toBeGreaterThan(compatibilityIndex);
    expect(registerChildIndex).toBeGreaterThan(compatibilityIndex);
    expect(mainSource).toContain('console.error(formatNativeCompatibilityFailure(compatibility.diagnostic))');
    expect(mainSource).toContain('reject(new Error(\'Desktop backend native compatibility check failed.\'))');
  });

  it('keeps ordinary backend exits restartable while native failures stay pre-spawn', () => {
    const mainSource = readFileSync(resolve(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

    expect(mainSource).toContain('function shouldRestartBackendAfterExit');
    expect(mainSource).toContain('!options.appQuitting && options.exitCode !== 0 && !options.nativeCompatibilityFailure');
    expect(mainSource).toContain('nativeCompatibilityFailure: false');
    expect(mainSource).toContain('Deterministic native compatibility failures are rejected before spawn.');
  });

  it('keeps backend readiness after service graph startup and server listen', () => {
    const serverSource = readFileSync(resolve(__dirname, '..', 'server', 'main.ts'), 'utf8');

    expect(serverSource.indexOf('createNousServices({')).toBeLessThan(
      serverSource.indexOf("server.listen(args.port, '127.0.0.1'"),
    );
    expect(serverSource.indexOf("server.listen(args.port, '127.0.0.1'")).toBeLessThan(
      serverSource.indexOf("process.send({ type: 'ready', port: args.port })"),
    );
  });

  it('uses the same probe source for launch-boundary compatibility checks', () => {
    const probeSource = createNativeCompatibilityProbeSource();

    expect(probeSource).toContain('require("better-sqlite3")');
    expect(probeSource).toContain('runtime: "PATH node"');
    expect(probeSource).toContain('process.versions.modules');
    expect(probeSource).not.toContain('pnpm rebuild');
    expect(probeSource).not.toContain('npm install');
  });
});
