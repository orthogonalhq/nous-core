#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_FILE);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const INSTALL_RUNNER = join(REPO_ROOT, 'scripts', 'install', 'run.mjs');

function printHelp() {
  process.stdout.write(
    [
      'Nous command launcher',
      '',
      'Usage:',
      '  nous install [installer-args...]',
      '  nous --help',
      '',
      'Commands:',
      '  install    Run the guided Nous installer',
      '',
    ].join('\n'),
  );
}

function runInstall(args) {
  const child = spawn(process.execPath, [INSTALL_RUNNER, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    process.stderr.write(`[nous] failed to start installer: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 1);
  });
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (command === 'install') {
    runInstall(rest);
    return;
  }

  process.stderr.write(`[nous] unknown command: ${command}\n`);
  printHelp();
  process.exit(1);
}

main();
