/**
 * IPC channel extraction helper for contract tests.
 *
 * Reads main/index.ts and preload/index.ts as text files and extracts
 * channel names via regex. No Electron runtime imports required.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = resolve(__dirname, '../main/index.ts');
const PRELOAD_PATH = resolve(__dirname, '../preload/index.ts');

const MAIN_CHANNEL_REGEX = /ipcMain\.handle\('([^']+)'/g;
const PRELOAD_CHANNEL_REGEX = /ipcRenderer\.invoke\('([^']+)'/g;

function extractChannels(filePath: string, regex: RegExp): string[] {
  const source = readFileSync(filePath, 'utf-8');
  const channels: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    channels.push(match[1]);
  }
  return channels;
}

export function getMainChannels(): string[] {
  return extractChannels(MAIN_PATH, MAIN_CHANNEL_REGEX);
}

export function getPreloadChannels(): string[] {
  return extractChannels(PRELOAD_PATH, PRELOAD_CHANNEL_REGEX);
}
