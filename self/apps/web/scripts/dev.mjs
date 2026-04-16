#!/usr/bin/env node
/**
 * Web dev server launcher.
 * Kills any existing process on the target port, then starts Next.js.
 * Single port, single .next cache — no port-scanning, no per-port dist dirs.
 */
import { createServer } from 'node:net';
import { spawn, execSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number.parseInt(process.env.NOUS_WEB_PORT || '4317', 10);
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function killPortHolder(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr ":${port}.*LISTENING"`, { encoding: 'utf8' });
      const pids = [...new Set(out.trim().split('\n').map((l) => l.trim().split(/\s+/).pop()))];
      for (const pid of pids) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    }
  } catch {
    // Nothing listening — that's fine
  }
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(port);
  });
}

async function main() {
  if (await isPortInUse(PORT)) {
    process.stderr.write(`[nous:web] port ${PORT} in use — killing existing process\n`);
    killPortHolder(PORT);
    // Remove stale .next cache — killed process may leave locked files
    await rm(resolve(WEB_ROOT, '.next'), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
    // Brief pause for OS to release the port
    await new Promise((r) => setTimeout(r, 500));
  }

  const extraArgs = process.argv.slice(2);
  const child = spawn('next', ['dev', '--port', String(PORT), ...extraArgs], {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, NOUS_WEB_PORT: String(PORT) },
  });

  child.on('error', (err) => {
    process.stderr.write(`[nous:web] failed to start dev server: ${err.message}\n`);
    process.exit(1);
  });

  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  process.stderr.write(`[nous:web] ${err.message}\n`);
  process.exit(1);
});
