/**
 * Ollama install, detect, start, and model pull for Nous installer.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Platform } from './detect-platform.js';

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_READY_TIMEOUT_MS = 30_000;
const OLLAMA_POLL_INTERVAL_MS = 500;

export type OllamaUpdateCheck = {
  state: 'available' | 'up-to-date' | 'unknown';
  detail: string;
};

export type OllamaUpdateResult = {
  updated: boolean;
  detail: string;
};

const OLLAMA_WINGET_ID = 'Ollama.Ollama';

function exec(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options?.cwd,
      env: options?.env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => (stdout += d.toString()));
    proc.stderr?.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseWingetVersion(output: string, packageId: string): string | null {
  const pattern = new RegExp(`${escapeRegExp(packageId)}\\s+([^\\s]+)`, 'i');
  const match = output.match(pattern);
  return match?.[1] ?? null;
}

async function resolveOllamaCommand(): Promise<string | null> {
  // 1) Explicit override for custom installs.
  const envPath = process.env.OLLAMA_PATH;
  if (envPath && existsSync(envPath)) {
    const { exitCode } = await exec(envPath, ['--version']);
    if (exitCode === 0) return envPath;
  }

  // 2) PATH lookup.
  {
    const { exitCode } = await exec('ollama', ['--version']);
    if (exitCode === 0) return 'ollama';
  }

  // 3) Windows default install location when PATH is not yet updated.
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const localPath = join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
      if (existsSync(localPath)) {
        const { exitCode } = await exec(localPath, ['--version']);
        if (exitCode === 0) return localPath;
      }
    }
  }

  return null;
}

async function requireOllamaCommand(): Promise<string> {
  const command = await resolveOllamaCommand();
  if (!command) {
    throw new Error(
      'Ollama CLI not found. Ensure Ollama is installed and available on PATH, or set OLLAMA_PATH.',
    );
  }
  return command;
}

export async function isOllamaInstalled(): Promise<boolean> {
  return (await resolveOllamaCommand()) !== null;
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isModelInstalled(modelId: string): Promise<boolean> {
  const ollamaCommand = await requireOllamaCommand();
  const { exitCode, stdout } = await exec(ollamaCommand, ['list']);
  if (exitCode !== 0) {
    return false;
  }

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.some((line) => {
    const name = line.split(/\s+/)[0];
    return name === modelId;
  });
}

export async function checkOllamaUpdate(platform: Platform): Promise<OllamaUpdateCheck> {
  if (!(await isOllamaInstalled())) {
    return { state: 'unknown', detail: 'Ollama not installed' };
  }

  switch (platform) {
    case 'win32': {
      const installed = await exec('winget', [
        'list',
        '--id',
        OLLAMA_WINGET_ID,
        '--exact',
      ]);
      if (installed.exitCode !== 0) {
        return { state: 'unknown', detail: `winget list exited ${installed.exitCode}` };
      }

      const available = await exec('winget', [
        'search',
        '--id',
        OLLAMA_WINGET_ID,
        '--exact',
      ]);
      if (available.exitCode !== 0) {
        return { state: 'unknown', detail: `winget search exited ${available.exitCode}` };
      }

      const installedVersion = parseWingetVersion(installed.stdout, OLLAMA_WINGET_ID);
      const latestVersion = parseWingetVersion(available.stdout, OLLAMA_WINGET_ID);

      if (!installedVersion || !latestVersion) {
        return { state: 'unknown', detail: 'Unable to parse installed/latest Ollama version' };
      }

      if (installedVersion === latestVersion) {
        return { state: 'up-to-date', detail: `Installed ${installedVersion}` };
      }

      return {
        state: 'available',
        detail: `Installed ${installedVersion}, latest ${latestVersion}`,
      };
    }
    case 'darwin': {
      const { exitCode, stdout, stderr } = await exec('brew', ['outdated', '--formula', 'ollama']);
      if (exitCode !== 0) {
        const detail = stderr.trim() || `brew exited ${exitCode}`;
        return { state: 'unknown', detail };
      }
      if (stdout.split(/\r?\n/).some((line) => line.trim() === 'ollama')) {
        return { state: 'available', detail: 'Update available via Homebrew' };
      }
      return { state: 'up-to-date', detail: 'No newer Ollama package detected' };
    }
    case 'linux':
    default:
      return {
        state: 'unknown',
        detail: 'Automatic update check not available on this platform',
      };
  }
}

export async function updateOllama(platform: Platform): Promise<OllamaUpdateResult> {
  switch (platform) {
    case 'win32': {
      const precheck = await checkOllamaUpdate(platform);
      if (precheck.state === 'up-to-date') {
        return { updated: false, detail: precheck.detail };
      }

      const { exitCode, stdout, stderr } = await exec('winget', [
        'upgrade',
        '--id',
        OLLAMA_WINGET_ID,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity',
      ]);
      const combined = `${stdout}\n${stderr}`;
      if (exitCode !== 0) {
        if (/no available upgrade found|no applicable update found/i.test(combined)) {
          return { updated: false, detail: 'Already up to date' };
        }
        throw new Error(`Ollama update failed (exit ${exitCode}). ${stderr || stdout}`);
      }
      if (/no available upgrade found|no applicable update found/i.test(combined)) {
        return { updated: false, detail: 'Already up to date' };
      }
      return { updated: true, detail: 'Updated via winget' };
    }
    case 'darwin': {
      const { exitCode, stdout, stderr } = await exec('brew', ['upgrade', 'ollama']);
      const combined = `${stdout}\n${stderr}`;
      if (exitCode !== 0) {
        if (/already up-to-date/i.test(combined)) {
          return { updated: false, detail: 'Already up to date' };
        }
        throw new Error(`Ollama update failed (exit ${exitCode}). ${stderr || stdout}`);
      }
      if (/already up-to-date/i.test(combined)) {
        return { updated: false, detail: 'Already up to date' };
      }
      return { updated: true, detail: 'Updated via Homebrew' };
    }
    case 'linux': {
      await installOllama(platform);
      return { updated: true, detail: 'Install script completed' };
    }
    default:
      throw new Error(`Unsupported platform for Ollama update: ${platform}`);
  }
}

export async function installOllama(platform: Platform): Promise<void> {
  let cmd: string;
  let args: string[];

  switch (platform) {
    case 'darwin':
      cmd = 'brew';
      args = ['install', 'ollama'];
      break;
    case 'linux':
      cmd = 'sh';
      args = ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'];
      break;
    case 'win32':
      cmd = 'winget';
      args = [
        'install',
        '--id',
        'Ollama.Ollama',
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity',
      ];
      break;
    default:
      throw new Error(`Unsupported platform for Ollama install: ${platform}`);
  }

  const { exitCode, stdout, stderr } = await exec(cmd, args);
  if (exitCode !== 0) {
    if (platform === 'win32') {
      const combined = `${stdout}\n${stderr}`;
      const alreadyInstalled =
        /existing package already installed/i.test(combined) ||
        /no available upgrade found/i.test(combined);
      if (alreadyInstalled) {
        return;
      }
    }
    throw new Error(
      `Ollama installation failed (exit ${exitCode}). ${stderr || 'See output above.'} Manual install: https://ollama.com`,
    );
  }
}

async function waitForOllama(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < OLLAMA_READY_TIMEOUT_MS) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      // Poll again
    }
    await new Promise((r) => setTimeout(r, OLLAMA_POLL_INTERVAL_MS));
  }
  throw new Error(
    `Ollama did not become ready within ${OLLAMA_READY_TIMEOUT_MS / 1000}s. Is it running?`,
  );
}

export async function startOllama(): Promise<void> {
  const ollamaCommand = await requireOllamaCommand();
  // ollama list starts the server if not running (on most platforms)
  const { exitCode } = await exec(ollamaCommand, ['list']);
  if (exitCode !== 0) {
    // Try explicit serve in background
    spawn(ollamaCommand, ['serve'], {
      shell: true,
      stdio: 'ignore',
      detached: true,
    });
  }
  await waitForOllama();
}

export async function pullModel(modelId: string): Promise<void> {
  const ollamaCommand = await requireOllamaCommand();
  const proc = spawn(ollamaCommand, ['pull', modelId], {
    shell: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const exitCode = await new Promise<number>((resolve) => {
    proc.on('close', (c) => resolve(c ?? -1));
  });
  if (exitCode !== 0) {
    throw new Error(
      `Model pull failed (exit ${exitCode}). Run 'ollama pull ${modelId}' manually.`,
    );
  }
}
