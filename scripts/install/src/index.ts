#!/usr/bin/env node
/**
 * Nous-OSS guided installer.
 *
 * Supports both fresh installs and repeat runs:
 * - Detect existing install state and health
 * - Check for Ollama updates (where supported)
 * - Offer actionable choices: open, repair, reconfigure, uninstall
 */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '@nous/autonomic-config';
import { detectPlatform, type Platform } from './detect-platform.js';
import { checkRequirements } from './check-requirements.js';
import {
    isOllamaInstalled,
    installOllama,
    startOllama,
    pullModel,
    isOllamaRunning,
    isModelInstalled,
    checkOllamaUpdate,
    updateOllama,
    type OllamaUpdateCheck,
} from './ollama.js';
import { generateDefaultConfig } from './config-generator.js';
import { writeConfig } from './write-config.js';
import { initStorage } from './init-storage.js';
import { uiBanner, uiFail, uiLine, uiNext, uiOk, uiStep, uiWarn } from './ui.js';

const DEFAULT_MODEL = 'llama3.2:3b';
const DATA_DIR = process.env.NOUS_DATA_DIR ?? './data';
const DEFAULT_BACKEND_PORT = 4317;
const PORT_SCAN_LIMIT = 25;
const EXPLICIT_BACKEND_PORT = process.env.NOUS_WEB_PORT?.trim();
const HAS_EXPLICIT_BACKEND_PORT = Boolean(EXPLICIT_BACKEND_PORT);
const NEXT_DIST_DIR_OVERRIDE = process.env.NOUS_NEXT_DIST_DIR?.trim();
const BACKEND_READY_TIMEOUT_MS = 60_000;
const BACKEND_POLL_INTERVAL_MS = 500;
const WEB_APP_DIR = join(process.cwd(), 'self', 'apps', 'web');

type BackendState = 'healthy' | 'unhealthy' | 'down';
type InstallerAction = 'open' | 'repair' | 'reconfigure' | 'uninstall' | 'quit';
type BackendBootResult = {
    process: ChildProcess | null;
    port: number;
    url: string;
};

type InstallAssessment = {
    existing: boolean;
    hasDataDir: boolean;
    hasConfig: boolean;
    hasDatabase: boolean;
    configValid: boolean;
    ollamaInstalled: boolean;
    ollamaRunning: boolean;
    modelInstalled: boolean;
    backendPort: number;
    backendState: BackendState;
    updateCheck: OllamaUpdateCheck;
};

function log(msg: string): void {
    console.log(msg);
}

function parsePort(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return fallback;
    }
    return parsed;
}

const REQUESTED_BACKEND_PORT = parsePort(EXPLICIT_BACKEND_PORT, DEFAULT_BACKEND_PORT);

function backendUrl(port: number): string {
    return `http://localhost:${port}`;
}

function resolveNextDistDir(port: number): string {
    return NEXT_DIST_DIR_OVERRIDE && NEXT_DIST_DIR_OVERRIDE.length > 0
        ? NEXT_DIST_DIR_OVERRIDE
        : `.next-${port}`;
}

function bootStepDetail(): string {
    return HAS_EXPLICIT_BACKEND_PORT
        ? `Start backend on port ${REQUESTED_BACKEND_PORT}`
        : `Start backend on available local port (preferred ${REQUESTED_BACKEND_PORT})`;
}

async function runStep<T>(
    index: number,
    total: number,
    title: string,
    detail: string,
    fn: () => Promise<T>,
): Promise<T> {
    const start = Date.now();
    uiStep(index, total, title, detail);
    try {
        const result = await fn();
        uiOk(`${Date.now() - start}ms`);
        return result;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        uiFail(msg);
        throw err;
    }
}

function openBrowser(url: string): void {
    const plat = process.platform;
    const cmd = plat === 'win32' ? 'start' : plat === 'darwin' ? 'open' : 'xdg-open';
    const args = plat === 'win32' ? ['', url] : [url];
    try {
        spawn(cmd, args, { shell: true, stdio: 'ignore' });
    } catch {
        log(`Open ${url} in your browser.`);
    }
}

function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptChoice(
    question: string,
    options: Array<{ key: string; label: string }>,
    defaultKey: string,
): Promise<string> {
    if (!isInteractive()) {
        log(`[nous:install] non-interactive mode -> ${defaultKey}`);
        return defaultKey;
    }

    const label = options.map((o) => `${o.key}=${o.label}`).join(', ');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        while (true) {
            const answer = (await rl.question(`${question} (${label}) [${defaultKey}]: `))
                .trim()
                .toLowerCase();

            if (!answer) {
                return defaultKey;
            }

            const selected = options.find((o) => o.key === answer[0]);
            if (selected) {
                return selected.key;
            }

            uiWarn(`Invalid choice "${answer}".`);
        }
    } finally {
        rl.close();
    }
}

async function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
    const choice = await promptChoice(
        question,
        [
            { key: 'y', label: 'yes' },
            { key: 'n', label: 'no' },
        ],
        defaultYes ? 'y' : 'n',
    );
    return choice === 'y';
}

async function waitForBackend(port: number): Promise<void> {
    const url = backendUrl(port);
    const start = Date.now();
    while (Date.now() - start < BACKEND_READY_TIMEOUT_MS) {
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(3000),
            });
            if (res.ok) return;
        } catch {
            // Poll again
        }
        await new Promise((r) => setTimeout(r, BACKEND_POLL_INTERVAL_MS));
    }
    throw new Error(
        `Backend did not start within ${BACKEND_READY_TIMEOUT_MS / 1000}s. Run 'pnpm dev:web' manually.`,
    );
}

async function probeBackendState(port: number): Promise<BackendState> {
    const url = backendUrl(port);
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(3000),
        });
        return res.ok ? 'healthy' : 'unhealthy';
    } catch {
        return 'down';
    }
}

async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
                return;
            }
            reject(err);
        });

        server.once('listening', () => {
            server.close(() => resolve(false));
        });

        server.listen(port);
    });
}

function isConfigValid(configPath: string): boolean {
    try {
        loadConfig(configPath);
        return true;
    } catch {
        return false;
    }
}

async function assessInstallation(
    platform: Platform,
    dataDir: string,
    configPath: string,
): Promise<InstallAssessment> {
    const hasDataDir = existsSync(dataDir);
    const hasConfig = existsSync(configPath);
    const hasDatabase = existsSync(join(dataDir, 'nous.sqlite'));
    const configValid = hasConfig ? isConfigValid(configPath) : false;
    const [ollamaInstalled, backendState] = await Promise.all([
        isOllamaInstalled(),
        probeBackendState(REQUESTED_BACKEND_PORT),
    ]);

    const [ollamaRunning, modelInstalled, updateCheck] = ollamaInstalled
        ? await Promise.all([
              isOllamaRunning(),
              isModelInstalled(DEFAULT_MODEL),
              checkOllamaUpdate(platform, { assumeInstalled: true }),
          ])
        : ([false, false, { state: 'unknown', detail: 'Ollama not installed' }] as const);

    return {
        existing: hasDataDir || hasConfig || hasDatabase,
        hasDataDir,
        hasConfig,
        hasDatabase,
        configValid,
        ollamaInstalled,
        ollamaRunning,
        modelInstalled,
        backendPort: REQUESTED_BACKEND_PORT,
        backendState,
        updateCheck,
    };
}

function asStatus(value: boolean): string {
    return value ? 'yes' : 'no';
}

function isWorkspaceHealthy(assessment: InstallAssessment): boolean {
    return (
        assessment.hasConfig &&
        assessment.configValid &&
        assessment.ollamaInstalled &&
        assessment.modelInstalled &&
        assessment.backendState !== 'unhealthy'
    );
}

function renderExistingSummary(assessment: InstallAssessment): void {
    uiLine();
    uiLine(' Existing install detected');
    uiLine(` Data directory    : ${asStatus(assessment.hasDataDir)}`);
    uiLine(` Config file       : ${assessment.hasConfig ? (assessment.configValid ? 'valid' : 'invalid') : 'missing'}`);
    uiLine(` Database file     : ${asStatus(assessment.hasDatabase)}`);
    uiLine(` Ollama installed  : ${asStatus(assessment.ollamaInstalled)}`);
    uiLine(` Ollama running    : ${asStatus(assessment.ollamaRunning)}`);
    uiLine(` Model ${DEFAULT_MODEL}: ${assessment.modelInstalled ? 'present' : 'missing'}`);
    uiLine(` Web backend       : ${assessment.backendState} (port ${assessment.backendPort})`);

    if (assessment.updateCheck.state === 'available') {
        uiLine(` Ollama update     : available (${assessment.updateCheck.detail})`);
    } else if (assessment.updateCheck.state === 'up-to-date') {
        uiLine(` Ollama update     : up to date`);
    } else {
        uiLine(` Ollama update     : unknown (${assessment.updateCheck.detail})`);
    }
    uiLine();
}

async function promptExistingAction(healthy: boolean): Promise<InstallerAction> {
    const selected = await promptChoice(
        healthy
            ? 'Choose action for existing install'
            : 'Existing install is not healthy. Choose remediation action',
        [
            { key: 'o', label: 'open app' },
            { key: 'r', label: 'repair install' },
            { key: 'c', label: 'reconfigure' },
            { key: 'u', label: 'uninstall workspace' },
            { key: 'q', label: 'quit' },
        ],
        healthy ? 'o' : 'r',
    );

    if (selected === 'o') return 'open';
    if (selected === 'r') return 'repair';
    if (selected === 'c') return 'reconfigure';
    if (selected === 'u') return 'uninstall';
    return 'quit';
}

async function findAvailablePort(startPort: number, maxAttempts = PORT_SCAN_LIMIT): Promise<number | null> {
    for (let offset = 0; offset < maxAttempts; offset += 1) {
        const candidate = startPort + offset;
        if (candidate > 65535) {
            return null;
        }

        if (!(await isPortInUse(candidate))) {
            return candidate;
        }
    }
    return null;
}

async function startBackendAtPort(
    port: number,
    dataDir: string,
    configPath: string,
): Promise<BackendBootResult> {
    const portValue = String(port);
    const url = backendUrl(port);
    log(`[nous:install] backend=starting port=${portValue}...`);
    const proc = spawn('pnpm', ['exec', 'next', 'dev', '--port', portValue], {
        shell: true,
        stdio: 'inherit',
        cwd: WEB_APP_DIR,
        env: {
            ...process.env,
            NOUS_DATA_DIR: dataDir,
            NOUS_CONFIG_PATH: configPath,
            NOUS_WEB_PORT: portValue,
            NOUS_NEXT_DIST_DIR: resolveNextDistDir(port),
        },
    });
    await waitForBackend(port);
    return {
        process: proc,
        port,
        url,
    };
}

async function ensureBackendRunning(dataDir: string, configPath: string): Promise<BackendBootResult> {
    const requestedPort = REQUESTED_BACKEND_PORT;
    const backendState = await probeBackendState(requestedPort);
    if (backendState === 'healthy') {
        const url = backendUrl(requestedPort);
        log(`[nous:install] backend=detected-running port=${requestedPort}`);
        return {
            process: null,
            port: requestedPort,
            url,
        };
    }

    const requestedOccupied = await isPortInUse(requestedPort);
    if (!requestedOccupied) {
        return startBackendAtPort(requestedPort, dataDir, configPath);
    }

    if (HAS_EXPLICIT_BACKEND_PORT) {
        const reason =
            backendState === 'unhealthy'
                ? `Port ${requestedPort} is already in use by an unhealthy process`
                : `Port ${requestedPort} is already in use by a non-responsive process`;
        throw new Error(`${reason}. Stop it or set NOUS_WEB_PORT to another port and rerun installer.`);
    }

    const fallbackPort = await findAvailablePort(requestedPort + 1);
    if (!fallbackPort) {
        throw new Error(
            `Ports ${requestedPort}-${requestedPort + PORT_SCAN_LIMIT - 1} are unavailable. Set NOUS_WEB_PORT and rerun installer.`,
        );
    }

    uiWarn(`Port ${requestedPort} is unavailable. Falling back to port ${fallbackPort}.`);
    return startBackendAtPort(fallbackPort, dataDir, configPath);
}

function finalizeInstaller(result: BackendBootResult): void {
    if (!result.process) {
        log(`[nous:install] Backend already running on ${result.url}. Installer complete.`);
        uiLine(` Installer complete. Existing backend reused at ${result.url}.`);
        return;
    }

    log(`[nous:install] Backend is running on ${result.url}. Press Ctrl+C to stop.`);
    uiLine(` Installer complete. Backend is running at ${result.url}; press Ctrl+C to stop.`);
    result.process.on('exit', (code) => {
        process.exit(code ?? 0);
    });
}

async function runInstallFlow(
    platform: Platform,
    dataDir: string,
    configPath: string,
    options?: { forceRewriteConfig?: boolean },
): Promise<BackendBootResult> {
    const total = 6;

    await runStep(1, total, 'Prepare Ollama runtime', 'Detect existing install or install if missing', async () => {
        let ollamaDetected = await isOllamaInstalled();
        if (!ollamaDetected) {
            log('[nous:install] ollama=installing...');
            await installOllama(platform);
            log('[nous:install] ollama=installed');
            ollamaDetected = await isOllamaInstalled();
        } else {
            log('[nous:install] ollama=detected');
        }

        if (!ollamaDetected) {
            throw new Error(
                'Ollama could not be detected after installation. Ensure Ollama is installed and rerun installer.',
            );
        }
    });

    await runStep(2, total, 'Start Ollama', 'Ensure local model server is reachable', async () => {
        log('[nous:install] ollama=starting...');
        await startOllama();
        log('[nous:install] ollama=started');
    });

    await runStep(3, total, 'Verify base model', `Check ${DEFAULT_MODEL}; download if missing`, async () => {
        const installed = await isModelInstalled(DEFAULT_MODEL);
        if (installed) {
            log(`[nous:install] model=${DEFAULT_MODEL} already-present`);
            return;
        }
        log(`[nous:install] model=${DEFAULT_MODEL} pulling...`);
        await pullModel(DEFAULT_MODEL);
        log(`[nous:install] model=${DEFAULT_MODEL} pulled`);
    });

    await runStep(4, total, 'Initialize Nous workspace', 'Create storage and ensure valid config', async () => {
        initStorage(dataDir);
        const shouldWriteConfig =
            Boolean(options?.forceRewriteConfig) ||
            !existsSync(configPath) ||
            !isConfigValid(configPath);

        if (shouldWriteConfig) {
            const config = generateDefaultConfig(dataDir, DEFAULT_MODEL);
            writeConfig(configPath, config);
            log(`[nous:install] config written to ${configPath}`);
            return;
        }

        log(`[nous:install] config retained at ${configPath}`);
    });

    const bootResult = await runStep(
        5,
        total,
        'Boot web app',
        bootStepDetail(),
        async () => ensureBackendRunning(dataDir, configPath),
    );

    await runStep(6, total, 'Open app experience', 'Launch browser to local app', async () => {
        openBrowser(bootResult.url);
        log(`[nous:install] Open ${bootResult.url} in your browser.`);
    });
    uiNext(bootResult.url);

    return bootResult;
}

async function runOpenFlow(dataDir: string, configPath: string): Promise<BackendBootResult> {
    const total = 2;

    const bootResult = await runStep(
        1,
        total,
        'Boot web app',
        bootStepDetail(),
        async () => ensureBackendRunning(dataDir, configPath),
    );

    await runStep(2, total, 'Open app experience', 'Launch browser to local app', async () => {
        openBrowser(bootResult.url);
        log(`[nous:install] Open ${bootResult.url} in your browser.`);
    });
    uiNext(bootResult.url);

    return bootResult;
}

async function runReconfigureFlow(dataDir: string, configPath: string): Promise<void> {
    await runStep(1, 1, 'Reconfigure workspace', 'Rewrite local config with installer defaults', async () => {
        initStorage(dataDir);
        const config = generateDefaultConfig(dataDir, DEFAULT_MODEL);
        writeConfig(configPath, config);
        log(`[nous:install] config rewritten at ${configPath}`);
    });
}

async function runUninstallFlow(dataDir: string): Promise<void> {
    await runStep(1, 1, 'Uninstall workspace', 'Remove local Nous data and config', async () => {
        if (!existsSync(dataDir)) {
            log('[nous:install] workspace=already-absent');
            return;
        }
        rmSync(dataDir, { recursive: true, force: true });
        log(`[nous:install] workspace removed at ${dataDir}`);
    });
}

async function main(): Promise<void> {
    const { platform: plat, display } = detectPlatform();
    const dataDir = join(process.cwd(), DATA_DIR);
    const configPath = join(dataDir, 'config.json5');

    log(`[nous:install] platform=${display}`);
    uiBanner(display, DEFAULT_MODEL, dataDir);

    const assessmentSteps = 2;
    await runStep(1, assessmentSteps, 'Inspect machine requirements', 'Disk and memory sanity checks', async () => {
        const req = checkRequirements();
        if (!req.ok) {
            req.errors.forEach((e) => uiWarn(e));
            throw new Error('System requirements check failed.');
        }
    });

    const assessment = await runStep(
        2,
        assessmentSteps,
        'Inspect existing workspace',
        'Check install health and optional Ollama updates',
        async () => assessInstallation(plat, dataDir, configPath),
    );
    if (assessment.existing) {
        renderExistingSummary(assessment);

        if (assessment.updateCheck.state === 'available') {
            const shouldUpdate = await promptYesNo(
                'An Ollama update is available. Install update now?',
                false,
            );
            if (shouldUpdate) {
                await runStep(1, 1, 'Update Ollama runtime', 'Apply available package update', async () => {
                    const result = await updateOllama(plat);
                    log(`[nous:install] ollama=update ${result.updated ? 'applied' : 'skipped'} (${result.detail})`);
                });
            }
        }

        const healthy = isWorkspaceHealthy(assessment);
        uiLine(
            healthy
                ? ' Existing install appears healthy. You can open immediately.'
                : ' Existing install is incomplete or unhealthy. Repair is recommended.',
        );

        const action = await promptExistingAction(healthy);
        if (action === 'quit') {
            uiLine(' Installer cancelled.');
            return;
        }

        if (action === 'open') {
            const bootResult = await runOpenFlow(dataDir, configPath);
            finalizeInstaller(bootResult);
            return;
        }

        if (action === 'repair') {
            const bootResult = await runInstallFlow(plat, dataDir, configPath, {
                forceRewriteConfig: !assessment.configValid,
            });
            finalizeInstaller(bootResult);
            return;
        }

        if (action === 'reconfigure') {
            await runReconfigureFlow(dataDir, configPath);
            const bootNow = await promptYesNo('Open app now?', true);
            if (bootNow) {
                const bootResult = await runOpenFlow(dataDir, configPath);
                finalizeInstaller(bootResult);
            }
            return;
        }

        const confirmed = await promptYesNo(
            `Remove local workspace at ${dataDir}?`,
            false,
        );
        if (!confirmed) {
            uiLine(' Uninstall cancelled.');
            return;
        }

        await runUninstallFlow(dataDir);
        const reinstall = await promptYesNo('Run fresh setup now?', true);
        if (!reinstall) {
            return;
        }

        const bootResult = await runInstallFlow(plat, dataDir, configPath, {
            forceRewriteConfig: true,
        });
        finalizeInstaller(bootResult);
        return;
    }

    const bootResult = await runInstallFlow(plat, dataDir, configPath, {
        forceRewriteConfig: true,
    });
    finalizeInstaller(bootResult);
}

main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    uiFail(msg);
    console.error(msg);
    process.exit(1);
});
