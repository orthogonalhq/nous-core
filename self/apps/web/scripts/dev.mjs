#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const DEFAULT_PORT = 4317;
const MAX_PORT_SCAN_ATTEMPTS = 25;

function parsePort(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function isPortInUse(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
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

async function findAvailablePort(startPort, maxAttempts = MAX_PORT_SCAN_ATTEMPTS) {
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

const explicitPort = process.env.NOUS_WEB_PORT?.trim();
const hasExplicitPort = Boolean(explicitPort);
const preferredPort = parsePort(explicitPort, DEFAULT_PORT);
let selectedPort = preferredPort;

if (await isPortInUse(preferredPort)) {
  if (hasExplicitPort) {
    console.error(
      `[nous:web] Port ${preferredPort} is unavailable and NOUS_WEB_PORT is explicitly set. Choose another port and retry.`,
    );
    process.exit(1);
  }

  const fallbackPort = await findAvailablePort(preferredPort + 1);
  if (!fallbackPort) {
    console.error(
      `[nous:web] Unable to find an open port in range ${preferredPort}-${preferredPort + MAX_PORT_SCAN_ATTEMPTS - 1}.`,
    );
    process.exit(1);
  }

  selectedPort = fallbackPort;
  console.warn(`[nous:web] Port ${preferredPort} is unavailable. Using port ${selectedPort}.`);
}

const port = String(selectedPort);
const extraArgs = process.argv.slice(2);
const distDir = process.env.NOUS_NEXT_DIST_DIR ?? `.next-${port}`;
const child = spawn('next', ['dev', '--port', port, ...extraArgs], {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    NOUS_WEB_PORT: port,
    NOUS_NEXT_DIST_DIR: distDir,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
