/**
 * UT-SR1 — AgentClassToolSurfaceRegistry V1 seed.
 */
import { describe, expect, it } from 'vitest';
import { defaultAgentClassToolSurfaceRegistry } from '../agent-class-tool-surface.js';

describe('defaultAgentClassToolSurfaceRegistry — V1 seed', () => {
  it("Worker surface does NOT include 'dispatch_agent' (SUP-001 rule)", () => {
    const tools = defaultAgentClassToolSurfaceRegistry.getAllowedToolsForClass('Worker');
    expect(tools.includes('dispatch_agent')).toBe(false);
  });

  it("Orchestrator surface includes 'dispatch_agent'", () => {
    const tools =
      defaultAgentClassToolSurfaceRegistry.getAllowedToolsForClass('Orchestrator');
    expect(tools.includes('dispatch_agent')).toBe(true);
  });

  it("Cortex::Principal has wildcard '*'", () => {
    const tools =
      defaultAgentClassToolSurfaceRegistry.getAllowedToolsForClass('Cortex::Principal');
    expect(tools.includes('*')).toBe(true);
  });

  it("Cortex::System has wildcard '*'", () => {
    const tools =
      defaultAgentClassToolSurfaceRegistry.getAllowedToolsForClass('Cortex::System');
    expect(tools.includes('*')).toBe(true);
  });

  it('Worker includes base read tools', () => {
    const tools = defaultAgentClassToolSurfaceRegistry.getAllowedToolsForClass('Worker');
    expect(tools.includes('read_file')).toBe(true);
  });
});
