/**
 * IPC channel contract test.
 *
 * Validates that every channel registered via ipcMain.handle() in the main
 * process has a corresponding ipcRenderer.invoke() call in the preload script,
 * and vice versa. Catches channel name drift between the two sides.
 */
import { describe, expect, it } from 'vitest';
import { getMainChannels, getPreloadChannels } from './ipc-channels.js';

describe('IPC channel contract', () => {
  const mainChannels = getMainChannels();
  const preloadChannels = getPreloadChannels();

  it('extracts a non-empty list of main channels', () => {
    expect(mainChannels.length).toBeGreaterThan(0);
  });

  it('extracts a non-empty list of preload channels', () => {
    expect(preloadChannels.length).toBeGreaterThan(0);
  });

  it('every main channel exists in preload channels', () => {
    const preloadSet = new Set(preloadChannels);
    const missing = mainChannels.filter((ch) => !preloadSet.has(ch));
    expect(missing, `Main channels missing from preload: ${missing.join(', ')}`).toEqual([]);
  });

  it('every preload channel exists in main channels', () => {
    const mainSet = new Set(mainChannels);
    const missing = preloadChannels.filter((ch) => !mainSet.has(ch));
    expect(missing, `Preload channels missing from main: ${missing.join(', ')}`).toEqual([]);
  });

  it('channel sets are identical', () => {
    expect(new Set(mainChannels)).toEqual(new Set(preloadChannels));
  });

  it('contains known channels as a smoke check', () => {
    const allChannels = new Set([...mainChannels, ...preloadChannels]);
    expect(allChannels.has('layout:get')).toBe(true);
    expect(allChannels.has('layout:set')).toBe(true);
    expect(allChannels.has('fs:readDir')).toBe(true);
    expect(allChannels.has('fs:readFile')).toBe(true);
  });

  it('channel counts match between main and preload', () => {
    expect(mainChannels.length).toBe(preloadChannels.length);
  });
});
