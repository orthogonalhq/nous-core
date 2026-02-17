#!/usr/bin/env node
/**
 * Nous-OSS guided installer.
 * Detects platform, checks requirements, installs/detects Ollama, pulls model,
 * initializes storage, generates config, starts backend, opens browser.
 */
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { detectPlatform } from './detect-platform.js';
import { checkRequirements } from './check-requirements.js';
import {
  isOllamaInstalled,
  installOllama,
  startOllama,
  pullModel,
} from './ollama.js';
import { generateDefaultConfig } from './config-generator.js';
import { writeConfig } from './write-config.js';
import { initStorage } from './init-storage.js';

const DEFAULT_MODEL = 'llama3.2:3b';
const DATA_DIR = process.env.NOUS_DATA_DIR ?? './data';
const BACKEND_URL = 'http://localhost:3000';
const FIRST_RUN_URL = `${BACKEND_URL}/first-run`;
const BACKEND_READY_TIMEOUT_MS = 60_000;
const BACKEND_POLL_INTERVAL_MS = 500;

function log(msg: string): void {
  console.log(msg);
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

async function main(): Promise<void> {
  const { platform: plat, display } = detectPlatform();
  log(`[nous:install] platform=${display}`);

  const req = checkRequirements();
  if (!req.ok) {
    req.errors.forEach((e) => log(`Error: ${e}`));
    process.exit(1);
  }

  const installed = await isOllamaInstalled();
  if (!installed) {
    log('[nous:install] ollama=installing...');
    await installOllama(plat);
    log('[nous:install] ollama=installed');
  } else {
    log('[nous:install] ollama=detected');
  }

  log('[nous:install] ollama=starting...');
  await startOllama();
  log('[nous:install] ollama=started');

  log(`[nous:install] model=${DEFAULT_MODEL} pulling...`);
  await pullModel(DEFAULT_MODEL);
  log(`[nous:install] model=${DEFAULT_MODEL} pulled`);

  const dataDir = join(process.cwd(), DATA_DIR);
  initStorage(dataDir);

  const configPath = join(dataDir, 'config.json5');
  const config = generateDefaultConfig(dataDir, DEFAULT_MODEL);
  writeConfig(configPath, config);
  log(`[nous:install] config written to ${configPath}`);

  log('[nous:install] backend starting...');
  const devProcess = spawn('pnpm', ['dev:web'], {
    shell: true,
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOUS_DATA_DIR: dataDir,
      NOUS_CONFIG_PATH: configPath,
    },
  });

  await waitForBackend();

  openBrowser(FIRST_RUN_URL);
  log(`[nous:install] Open ${FIRST_RUN_URL} in your browser.`);
  log('[nous:install] Backend is running. Press Ctrl+C to stop.');

  devProcess.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
