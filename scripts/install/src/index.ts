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
const BACKEND_PORT = process.env.NOUS_WEB_PORT ?? '4317';
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const NEXT_DIST_DIR = process.env.NOUS_NEXT_DIST_DIR ?? `.next-${BACKEND_PORT}`;
const BACKEND_READY_TIMEOUT_MS = 60_000;
const BACKEND_POLL_INTERVAL_MS = 500;
const WEB_APP_DIR = join(process.cwd(), 'self', 'apps', 'web');

type BackendState = 'healthy' | 'unhealthy' | 'down';
type InstallerAction = 'open' | 'repair' | 'reconfigure' | 'uninstall' | 'quit';

type InstallAssessment = {
    existing: boolean;
    hasDataDir: boolean;
    hasConfig: boolean;
    hasDatabase: boolean;
    configValid: boolean;
    ollamaInstalled: boolean;
    ollamaRunning: boolean;
    modelInstalled: boolean;
    backendState: BackendState;
    updateCheck: OllamaUpdateCheck;
};

function log(msg: string): void {
    console.log(msg);
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

async function waitForBackend(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < BACKEND_READY_TIMEOUT_MS) {
        try {
            const res = await fetch(BACKEND_URL, {
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

async function probeBackendState(): Promise<BackendState> {
    try {
        const res = await fetch(BACKEND_URL, {
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
        probeBackendState(),
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
    uiLine(` Web backend       : ${assessment.backendState}`);

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

async function ensureBackendRunning(dataDir: string, configPath: string): Promise<ChildProcess | null> {
    const backendState = await probeBackendState();
    if (backendState === 'healthy') {
        log('[nous:install] backend=detected-running');
        return null;
    }
    if (backendState === 'unhealthy') {
        throw new Error(
            `Port ${BACKEND_PORT} is already in use by an unhealthy process. Stop it and rerun installer.`,
        );
    }
    const portOccupied = await isPortInUse(Number(BACKEND_PORT));
    if (portOccupied) {
        throw new Error(
            `Port ${BACKEND_PORT} is already in use by a non-responsive process. Stop it and rerun installer.`,
        );
    }

    log('[nous:install] backend=starting...');
    const proc = spawn('pnpm', ['exec', 'next', 'dev', '--port', BACKEND_PORT], {
        shell: true,
        stdio: 'inherit',
        cwd: WEB_APP_DIR,
        env: {
            ...process.env,
            NOUS_DATA_DIR: dataDir,
            NOUS_CONFIG_PATH: configPath,
            NOUS_NEXT_DIST_DIR: NEXT_DIST_DIR,
        },
    });
    await waitForBackend();
    return proc;
}

function finalizeInstaller(devProcess: ChildProcess | null): void {
    if (!devProcess) {
        log('[nous:install] Backend already running. Installer complete.');
        uiLine(' Installer complete. Existing backend reused.');
        return;
    }

    log('[nous:install] Backend is running. Press Ctrl+C to stop.');
    uiLine(' Installer complete. Backend is running; press Ctrl+C to stop.');
    devProcess.on('exit', (code) => {
        process.exit(code ?? 0);
    });
}

async function runInstallFlow(
    platform: Platform,
    dataDir: string,
    configPath: string,
    options?: { forceRewriteConfig?: boolean },
): Promise<ChildProcess | null> {
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

    const devProcess = await runStep(
        5,
        total,
        'Boot web app',
        `Start backend on port ${BACKEND_PORT}`,
        async () => ensureBackendRunning(dataDir, configPath),
    );

    await runStep(6, total, 'Open app experience', 'Launch browser to local app', async () => {
        openBrowser(BACKEND_URL);
        log(`[nous:install] Open ${BACKEND_URL} in your browser.`);
    });
    uiNext(BACKEND_URL);

    return devProcess;
}

async function runOpenFlow(dataDir: string, configPath: string): Promise<ChildProcess | null> {
    const total = 2;

    const devProcess = await runStep(
        1,
        total,
        'Boot web app',
        `Start backend on port ${BACKEND_PORT}`,
        async () => ensureBackendRunning(dataDir, configPath),
    );

    await runStep(2, total, 'Open app experience', 'Launch browser to local app', async () => {
        openBrowser(BACKEND_URL);
        log(`[nous:install] Open ${BACKEND_URL} in your browser.`);
    });
    uiNext(BACKEND_URL);

    return devProcess;
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
            const devProcess = await runOpenFlow(dataDir, configPath);
            finalizeInstaller(devProcess);
            return;
        }

        if (action === 'repair') {
            const devProcess = await runInstallFlow(plat, dataDir, configPath, {
                forceRewriteConfig: !assessment.configValid,
            });
            finalizeInstaller(devProcess);
            return;
        }

        if (action === 'reconfigure') {
            await runReconfigureFlow(dataDir, configPath);
            const bootNow = await promptYesNo('Open app now?', true);
            if (bootNow) {
                const devProcess = await runOpenFlow(dataDir, configPath);
                finalizeInstaller(devProcess);
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

        const devProcess = await runInstallFlow(plat, dataDir, configPath, {
            forceRewriteConfig: true,
        });
        finalizeInstaller(devProcess);
        return;
    }

    const devProcess = await runInstallFlow(plat, dataDir, configPath, {
        forceRewriteConfig: true,
    });
    finalizeInstaller(devProcess);
}

main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    uiFail(msg);
    console.error(msg);
    process.exit(1);
});
