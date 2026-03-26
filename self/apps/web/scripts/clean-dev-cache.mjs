/**
 * Removes stale .next-{port} dev cache directories before dev server start.
 * Runs via the `predev` npm lifecycle hook in package.json.
 * Uses Node.js fs API for cross-platform compatibility.
 */
import { readdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let entries;
try {
  entries = await readdir(webRoot);
} catch (err) {
  process.stderr.write(`[nous:web] warning: could not read web root for cache cleanup: ${err.message}\n`);
  process.exit(0);
}

const stale = entries.filter((e) => /^\.next-\d+$/.test(e));

for (const dir of stale) {
  const target = resolve(webRoot, dir);
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
    process.stderr.write(`[nous:web] removed stale dev cache: ${dir}\n`);
  } catch (err) {
    process.stderr.write(`[nous:web] warning: could not remove stale cache dir ${dir}: ${err.message}\n`);
  }
}
