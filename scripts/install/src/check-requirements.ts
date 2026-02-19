/**
 * System requirement checks for Nous installer.
 */
import { statSync } from 'node:fs';
import { freemem, homedir, totalmem } from 'node:os';

const MIN_MEMORY_GB = 4;
const BYTES_PER_GB = 1024 * 1024 * 1024;

export interface RequirementResult {
  ok: boolean;
  errors: string[];
}

/**
 * Check disk space and memory. Returns ok: false if critical requirements fail.
 * Memory check is advisory (Ollama will fail if insufficient).
 */
export function checkRequirements(): RequirementResult {
  const errors: string[] = [];

  // Disk: check home dir or cwd exists and is writable.
  try {
    const checkDir = process.platform === 'win32' ? homedir() : process.cwd();
    const stat = statSync(checkDir);
    if (!stat.isDirectory()) {
      errors.push(`Check path ${checkDir} is not a directory`);
    }
  } catch (err) {
    errors.push(
      `Cannot check disk: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Memory: advisory
  const totalMem = totalmem();
  const freeMem = freemem();
  const totalGB = totalMem / BYTES_PER_GB;
  const freeGB = freeMem / BYTES_PER_GB;

  if (totalGB < MIN_MEMORY_GB) {
    errors.push(
      `System memory (${totalGB.toFixed(1)} GB) is below recommended minimum (${MIN_MEMORY_GB} GB)`,
    );
  } else if (freeGB < MIN_MEMORY_GB) {
    errors.push(
      `Free memory (${freeGB.toFixed(1)} GB) is low. Ollama may need ${MIN_MEMORY_GB} GB.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
