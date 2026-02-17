/**
 * Ollama install, detect, start, and model pull for Nous installer.
 */
import { spawn } from 'node:child_process';
import type { Platform } from './detect-platform.js';

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_READY_TIMEOUT_MS = 30_000;
const OLLAMA_POLL_INTERVAL_MS = 500;

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

export async function isOllamaInstalled(): Promise<boolean> {
  const { exitCode } = await exec('ollama', ['--version']);
  return exitCode === 0;
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
      args = ['install', 'Ollama.Ollama', '--accept-package-agreements'];
      break;
    default:
      throw new Error(`Unsupported platform for Ollama install: ${platform}`);
  }

  const { exitCode, stderr } = await exec(cmd, args);
  if (exitCode !== 0) {
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
  // ollama list starts the server if not running (on most platforms)
  const { exitCode } = await exec('ollama', ['list']);
  if (exitCode !== 0) {
    // Try explicit serve in background
    spawn('ollama', ['serve'], {
      shell: true,
      stdio: 'ignore',
      detached: true,
    });
  }
  await waitForOllama();
}

export async function pullModel(modelId: string): Promise<void> {
  const proc = spawn('ollama', ['pull', modelId], {
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
