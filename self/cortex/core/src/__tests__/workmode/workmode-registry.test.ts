/**
 * Workmode registry behavior tests.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryWorkmodeRegistry } from '../../workmode/workmode-registry.js';
import { SYSTEM_IMPLEMENTATION } from '../../workmode/system-workmodes.js';

describe('InMemoryWorkmodeRegistry', () => {
  it('register() stores contract', () => {
    const registry = new InMemoryWorkmodeRegistry();
    registry.register(SYSTEM_IMPLEMENTATION);
    expect(registry.get('system:implementation')).toEqual(SYSTEM_IMPLEMENTATION);
  });

  it('get() returns null for unknown workmode', () => {
    const registry = new InMemoryWorkmodeRegistry();
    expect(registry.get('system:unknown')).toBeNull();
  });

  it('list() returns registered workmode IDs', () => {
    const registry = new InMemoryWorkmodeRegistry();
    registry.register(SYSTEM_IMPLEMENTATION);
    const list = registry.list();
    expect(list).toContain('system:implementation');
    expect(list.length).toBe(1);
  });

  it('register() overwrites existing contract', () => {
    const registry = new InMemoryWorkmodeRegistry();
    registry.register(SYSTEM_IMPLEMENTATION);
    const modified = { ...SYSTEM_IMPLEMENTATION, version: '2.0' };
    registry.register(modified);
    expect(registry.get('system:implementation')?.version).toBe('2.0');
  });
});
