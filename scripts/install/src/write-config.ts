/**
 * Write Nous config to disk.
 */
import { writeFileSync } from 'node:fs';
import type { SystemConfig } from '@nous/autonomic-config';

export function writeConfig(configPath: string, config: SystemConfig): void {
  writeFileSync(
    configPath,
    JSON.stringify(config, null, 2),
    'utf-8',
  );
}
