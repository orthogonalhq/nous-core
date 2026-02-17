/**
 * Initialize Nous data directory.
 */
import { mkdirSync } from 'node:fs';

export function initStorage(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}
