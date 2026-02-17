/**
 * First-run completion flag — server-side only.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IProjectStore } from '@nous/shared';

const FLAG_FILE = '.nous-first-run-complete';

export async function isFirstRunComplete(
  dataDir: string,
  projectStore: IProjectStore,
): Promise<boolean> {
  const flagPath = join(dataDir, FLAG_FILE);
  if (existsSync(flagPath)) {
    return true;
  }
  const projects = await projectStore.list();
  return projects.length > 0;
}

export function markFirstRunComplete(dataDir: string): void {
  const flagPath = join(dataDir, FLAG_FILE);
  writeFileSync(flagPath, '{}', 'utf-8');
  console.log('[nous:first-run] complete');
}
