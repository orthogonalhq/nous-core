/**
 * Removes stale .next-{port} dev cache directories before dev server start.
 * Runs via the `predev` npm lifecycle hook in package.json.
 * Uses Node.js fs API for cross-platform compatibility.
 */
import { readdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = await readdir(webRoot);
const stale = entries.filter((e) => /^\.next-\d+$/.test(e));

for (const dir of stale) {
  const target = resolve(webRoot, dir);
  await rm(target, { recursive: true, force: true });
  process.stderr.write(`[nous:web] removed stale dev cache: ${dir}\n`);
}
