#!/usr/bin/env node
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const MIN_PORT = 1;
const MAX_PORT = 65535;
const DEFAULT_PORT = 4317;
const DEFAULT_SCAN_LIMIT = 20;

function parsePositiveInteger(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePort(rawValue, fallback) {
  const parsed = parsePositiveInteger(rawValue, fallback);
  if (parsed < MIN_PORT || parsed > MAX_PORT) {
    return fallback;
  }
  return parsed;
}

function isPortInUse(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', (err) => {
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

async function resolvePort(preferredPort, scanLimit) {
  for (let offset = 0; offset < scanLimit; offset += 1) {
    const candidatePort = preferredPort + offset;
    if (candidatePort > MAX_PORT) {
      break;
    }

    const occupied = await isPortInUse(candidatePort);
    if (!occupied) {
      return candidatePort;
    }
  }

  const maxCandidatePort = Math.min(MAX_PORT, preferredPort + scanLimit - 1);
  throw new Error(
    `Unable to find an open web port in range ${preferredPort}-${maxCandidatePort}. Stop conflicting processes or set NOUS_WEB_PORT.`,
  );
}

const preferredPort = parsePort(process.env.NOUS_WEB_PORT, DEFAULT_PORT);
const portScanLimit = parsePositiveInteger(
  process.env.NOUS_WEB_PORT_SCAN_LIMIT,
  DEFAULT_SCAN_LIMIT,
);
const extraArgs = process.argv.slice(2);

async function main() {
  const resolvedPort = await resolvePort(preferredPort, portScanLimit);
  if (resolvedPort !== preferredPort) {
    process.stderr.write(
      `[nous:web] preferred port ${preferredPort} unavailable; using ${resolvedPort}\n`,
    );
  }

  const distDir = process.env.NOUS_NEXT_DIST_DIR ?? `.next-${resolvedPort}`;
  const child = spawn('next', ['dev', '--port', String(resolvedPort), ...extraArgs], {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      NOUS_WEB_PORT: String(resolvedPort),
      NOUS_NEXT_DIST_DIR: distDir,
    },
  });

  child.on('error', (err) => {
    process.stderr.write(
      `[nous:web] failed to start dev server: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  process.stderr.write(`[nous:web] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
