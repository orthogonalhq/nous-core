/**
 * Catalog concurrency annotations — completeness and classification correctness.
 *
 * WR-160 Phase 1.1 — Tier 2 behavior test.
 * Ensures every entry in INTERNAL_MCP_CATALOG has an explicit isConcurrencySafe
 * boolean, and that the value aligns with the tool's capabilities array.
 */
import { describe, expect, it } from 'vitest';
import { INTERNAL_MCP_CATALOG } from '../../internal-mcp/catalog.js';

describe('INTERNAL_MCP_CATALOG concurrency annotations', () => {
  it('contains exactly 56 entries', () => {
    expect(INTERNAL_MCP_CATALOG).toHaveLength(56);
  });

  for (const entry of INTERNAL_MCP_CATALOG) {
    describe(`${entry.name}`, () => {
      it('has isConcurrencySafe as a defined boolean', () => {
        expect(entry.definition.isConcurrencySafe).toBeDefined();
        expect(typeof entry.definition.isConcurrencySafe).toBe('boolean');
      });
    });
  }

  it('all read-only tools are marked isConcurrencySafe: true', () => {
    const readOnlyEntries = INTERNAL_MCP_CATALOG.filter(
      (e) =>
        e.definition.capabilities.length === 1 &&
        e.definition.capabilities[0] === 'read',
    );
    expect(readOnlyEntries.length).toBeGreaterThan(0);
    for (const entry of readOnlyEntries) {
      expect(
        entry.definition.isConcurrencySafe,
        `${entry.name} should be isConcurrencySafe: true (capabilities: ['read'])`,
      ).toBe(true);
    }
  });

  it('all write/control/execute tools are marked isConcurrencySafe: false', () => {
    const mutatingEntries = INTERNAL_MCP_CATALOG.filter((e) =>
      e.definition.capabilities.some(
        (c) => c === 'write' || c === 'control' || c === 'execute',
      ),
    );
    expect(mutatingEntries.length).toBeGreaterThan(0);
    for (const entry of mutatingEntries) {
      expect(
        entry.definition.isConcurrencySafe,
        `${entry.name} should be isConcurrencySafe: false (capabilities: [${entry.definition.capabilities.map((c) => `'${c}'`).join(', ')}])`,
      ).toBe(false);
    }
  });

  it('read-only + mutating entries account for all 56 entries', () => {
    const readOnly = INTERNAL_MCP_CATALOG.filter(
      (e) =>
        e.definition.capabilities.length === 1 &&
        e.definition.capabilities[0] === 'read',
    );
    const mutating = INTERNAL_MCP_CATALOG.filter((e) =>
      e.definition.capabilities.some(
        (c) => c === 'write' || c === 'control' || c === 'execute',
      ),
    );
    expect(readOnly.length + mutating.length).toBe(56);
  });
});
