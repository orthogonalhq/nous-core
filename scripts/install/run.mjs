#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const INSTALL_ENTRY = join(ROOT_DIR, 'scripts', 'install', 'dist', 'index.js');
const PNPM_CMD = process.platform === 'win32' ? 'pnpm' : 'pnpm';
const INSTALLER_ARGS = process.argv.slice(2);

function runQuiet(command, args, cwd = ROOT_DIR) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function runInstaller() {
  const child = spawn(process.execPath, [INSTALL_ENTRY, ...INSTALLER_ARGS], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error(`[nous:install] failed to launch installer: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 1);
  });
}

async function main() {
  const build = await runQuiet(PNPM_CMD, ['--filter', 'nous-install', 'run', 'build']);
  if (build.code !== 0) {
    if (build.stdout.trim()) process.stdout.write(build.stdout);
    if (build.stderr.trim()) process.stderr.write(build.stderr);
    console.error(`[nous:install] build failed with exit ${build.code}`);
    process.exit(build.code);
  }

  runInstaller();
}

main().catch((err) => {
  console.error(`[nous:install] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
