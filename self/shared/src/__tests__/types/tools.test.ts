/**
 * ToolDefinitionSchema extension — isConcurrencySafe field validation.
 *
 * WR-160 Phase 1.1 — Tier 1 contract test.
 */
import { describe, expect, it } from 'vitest';
import { ToolDefinitionSchema } from '../../types/tools.js';

const validBase = {
  name: 'test_tool',
  version: '1.0.0',
  description: 'A test tool',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { result: 'string' },
  capabilities: ['read'],
  permissionScope: 'project',
};

describe('ToolDefinitionSchema — isConcurrencySafe field', () => {
  it('accepts isConcurrencySafe: true', () => {
    const result = ToolDefinitionSchema.safeParse({
      ...validBase,
      isConcurrencySafe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isConcurrencySafe).toBe(true);
    }
  });

  it('accepts isConcurrencySafe: false', () => {
    const result = ToolDefinitionSchema.safeParse({
      ...validBase,
      isConcurrencySafe: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isConcurrencySafe).toBe(false);
    }
  });

  it('accepts object without isConcurrencySafe (backward compatibility)', () => {
    const result = ToolDefinitionSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isConcurrencySafe).toBeUndefined();
    }
  });

  it('rejects non-boolean isConcurrencySafe value', () => {
    const result = ToolDefinitionSchema.safeParse({
      ...validBase,
      isConcurrencySafe: 'yes',
    });
    expect(result.success).toBe(false);
  });
});
