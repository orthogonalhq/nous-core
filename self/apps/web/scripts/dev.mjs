#!/usr/bin/env node
import { spawn } from 'node:child_process';

const port = process.env.NOUS_WEB_PORT ?? '4317';
const extraArgs = process.argv.slice(2);
const distDir = process.env.NOUS_NEXT_DIST_DIR ?? `.next-${port}`;
const child = spawn('next', ['dev', '--port', port, ...extraArgs], {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    NOUS_NEXT_DIST_DIR: distDir,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
