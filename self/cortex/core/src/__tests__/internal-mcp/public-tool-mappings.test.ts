import { describe, expect, it } from 'vitest';
import {
  getPublicToolMapping,
  PUBLIC_MCP_TOOL_MAPPINGS,
} from '../../internal-mcp/public-tool-mappings.js';

describe('public tool mappings', () => {
  it('keeps flat internal names and enables the Phase 13.3 public surface', () => {
    expect(PUBLIC_MCP_TOOL_MAPPINGS.length).toBeGreaterThan(0);
    expect(PUBLIC_MCP_TOOL_MAPPINGS.every((entry) => !entry.internalName.includes('.'))).toBe(true);
    expect(
      PUBLIC_MCP_TOOL_MAPPINGS.filter((entry) => entry.enabledInCurrentPhase).map(
        (entry) => entry.externalName,
      ),
    ).toEqual([
      'ortho.memory.v1.put',
      'ortho.memory.v1.get',
      'ortho.memory.v1.search',
      'ortho.memory.v1.delete',
      'ortho.memory.v1.compact',
      'ortho.agents.v1.list',
      'ortho.agents.v1.invoke',
      'ortho.system.v1.info',
    ]);
    expect(
      getPublicToolMapping('ortho.agents.v1.invoke'),
    ).toEqual(
      expect.objectContaining({
        scopeStrategy: 'agent_invoke_with_bindings',
        enabledInCurrentPhase: true,
        execution: { taskSupport: 'optional' },
      }),
    );
    expect(
      PUBLIC_MCP_TOOL_MAPPINGS.some((entry) => entry.internalName.startsWith('promoted_memory_')),
    ).toBe(false);
  });

  it('looks up mappings by public tool name', () => {
    expect(getPublicToolMapping('ortho.memory.v1.put')).toEqual(
      expect.objectContaining({
        internalName: 'external_memory_put',
        scopeStrategy: 'memory_write_by_tier',
      }),
    );
    expect(getPublicToolMapping('ortho.unknown.v1.missing')).toBeNull();
  });
});
