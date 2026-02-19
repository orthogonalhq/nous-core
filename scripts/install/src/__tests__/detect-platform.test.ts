import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../detect-platform.js';

describe('detectPlatform', () => {
  it('returns object with platform, arch, and display', () => {
    const result = detectPlatform();
    expect(result).toHaveProperty('platform');
    expect(result).toHaveProperty('arch');
    expect(result).toHaveProperty('display');
    expect(['darwin', 'linux', 'win32']).toContain(result.platform);
    expect(typeof result.arch).toBe('string');
    expect(result.display).toContain(result.arch);
  });

  it('display includes platform label and arch', () => {
    const result = detectPlatform();
    expect(result.display).toMatch(/\w+\s+\w+/);
  });
});
