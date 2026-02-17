import { describe, it, expect } from 'vitest';
import { checkRequirements } from '../check-requirements.js';

describe('checkRequirements', () => {
  it('returns ok and errors shape', () => {
    const result = checkRequirements();
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('errors');
    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
