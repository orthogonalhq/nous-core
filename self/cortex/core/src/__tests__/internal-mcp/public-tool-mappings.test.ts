import { describe, expect, it } from 'vitest';
import {
  getPublicToolMapping,
  PUBLIC_MCP_TOOL_MAPPINGS,
} from '../../internal-mcp/public-tool-mappings.js';

describe('public tool mappings', () => {
  it('keeps flat internal names and disabled shipped mappings for Phase 13.1', () => {
    expect(PUBLIC_MCP_TOOL_MAPPINGS.length).toBeGreaterThan(0);
    expect(PUBLIC_MCP_TOOL_MAPPINGS.every((entry) => !entry.internalName.includes('.'))).toBe(true);
    expect(PUBLIC_MCP_TOOL_MAPPINGS.every((entry) => entry.enabledInCurrentPhase === false)).toBe(true);
  });

  it('looks up mappings by public tool name', () => {
    expect(getPublicToolMapping('ortho.memory.v1.put')?.internalName).toBe('external_memory_put');
    expect(getPublicToolMapping('ortho.unknown.v1.missing')).toBeNull();
  });
});
