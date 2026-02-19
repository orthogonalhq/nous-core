#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const LAUNCHER_PATH = join(REPO_ROOT, 'scripts', 'launcher', 'nous.mjs');
const BIN_DIR = join(homedir(), '.nous', 'bin');

function installWindowsShim() {
  const cmdPath = join(BIN_DIR, 'nous.cmd');
  const cmdBody = [
    '@echo off',
    'setlocal',
    `node "${LAUNCHER_PATH}" %*`,
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n');
  writeFileSync(cmdPath, cmdBody, 'utf8');

  const escapedBin = BIN_DIR.replace(/\\/g, '\\\\');
  const escapedCmd = cmdPath.replace(/\\/g, '\\\\');
  process.stdout.write(`[nous:bootstrap] Installed launcher: ${cmdPath}\n`);
  process.stdout.write(`[nous:bootstrap] Run now: "${cmdPath}" install\n`);
  process.stdout.write('[nous:bootstrap] Optional (new terminals only): add to PATH with PowerShell:\n');
  process.stdout.write(
    `  $p = [Environment]::GetEnvironmentVariable("Path","User"); [Environment]::SetEnvironmentVariable("Path", "$p;${escapedBin}", "User")\n`,
  );
  process.stdout.write('[nous:bootstrap] After PATH update, run: nous install\n');
  process.stdout.write(`[nous:bootstrap] If needed, remove launcher later: Remove-Item "${escapedCmd}"\n`);
}

function installUnixShim() {
  const shimPath = join(BIN_DIR, 'nous');
  const shimBody = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `node "${LAUNCHER_PATH}" "$@"`,
    '',
  ].join('\n');
  writeFileSync(shimPath, shimBody, 'utf8');
  chmodSync(shimPath, 0o755);

  process.stdout.write(`[nous:bootstrap] Installed launcher: ${shimPath}\n`);
  process.stdout.write(`[nous:bootstrap] Run now: "${shimPath}" install\n`);
  process.stdout.write(`[nous:bootstrap] Optional: add to PATH:\n  export PATH="${BIN_DIR}:$PATH"\n`);
  process.stdout.write('[nous:bootstrap] After PATH update, run: nous install\n');
}

function main() {
  if (!existsSync(LAUNCHER_PATH)) {
    process.stderr.write(`[nous:bootstrap] Launcher not found: ${LAUNCHER_PATH}\n`);
    process.exit(1);
  }

  mkdirSync(BIN_DIR, { recursive: true });
  if (platform() === 'win32') {
    installWindowsShim();
  } else {
    installUnixShim();
  }
}

main();
