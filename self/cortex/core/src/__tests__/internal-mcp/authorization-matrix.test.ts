import { describe, expect, it } from 'vitest';
import {
  getAuthorizedInternalMcpTools,
  getToolsByDomain,
  INTERNAL_MCP_CATALOG,
} from '../../internal-mcp/index.js';

const TASK_TOOLS = [
  'task_list',
  'task_get',
  'task_create',
  'task_update',
  'task_delete',
  'task_toggle',
  'task_trigger',
  'task_history',
  'workflow_history',
] as const;

describe('Authorization matrix — task/workflow tool grants', () => {
  it('Cortex::System receives all 9 new task/workflow tools', () => {
    const tools = getAuthorizedInternalMcpTools('Cortex::System');
    for (const name of TASK_TOOLS) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it('Orchestrator receives 8 tools (not task_delete)', () => {
    const tools = getAuthorizedInternalMcpTools('Orchestrator');
    const expected = TASK_TOOLS.filter((t) => t !== 'task_delete');
    for (const name of expected) {
      expect(tools.has(name)).toBe(true);
    }
    expect(tools.has('task_delete')).toBe(false);
  });

  it('Worker receives 4 read-only tools', () => {
    const tools = getAuthorizedInternalMcpTools('Worker');
    const readOnly = ['task_list', 'task_get', 'task_history', 'workflow_history'] as const;
    for (const name of readOnly) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it('Worker does NOT have access to write/delete/toggle/trigger task tools', () => {
    const tools = getAuthorizedInternalMcpTools('Worker');
    const denied = ['task_create', 'task_update', 'task_delete', 'task_toggle', 'task_trigger'] as const;
    for (const name of denied) {
      expect(tools.has(name)).toBe(false);
    }
  });

  it('Orchestrator does NOT have access to task_delete', () => {
    const tools = getAuthorizedInternalMcpTools('Orchestrator');
    expect(tools.has('task_delete')).toBe(false);
  });

  it('Cortex::Principal does NOT have any of the 9 new tools', () => {
    const tools = getAuthorizedInternalMcpTools('Cortex::Principal');
    for (const name of TASK_TOOLS) {
      expect(tools.has(name)).toBe(false);
    }
  });
});

describe('Catalog domain tags', () => {
  it('all 56 catalog entries have a domain field', () => {
    expect(INTERNAL_MCP_CATALOG).toHaveLength(56);
    for (const entry of INTERNAL_MCP_CATALOG) {
      expect(entry.domain).toBeDefined();
      expect(['agent', 'app', 'bridge']).toContain(entry.domain);
    }
  });

  it('bridge tool count is exactly 8', () => {
    const bridgeTools = INTERNAL_MCP_CATALOG.filter((e) => e.domain === 'bridge');
    expect(bridgeTools).toHaveLength(8);
  });

  it('app tool count is exactly 5', () => {
    const appTools = INTERNAL_MCP_CATALOG.filter((e) => e.domain === 'app');
    expect(appTools).toHaveLength(5);
  });

  it('agent tool count is exactly 43', () => {
    const agentTools = INTERNAL_MCP_CATALOG.filter((e) => e.domain === 'agent');
    expect(agentTools).toHaveLength(43);
  });

  it('getToolsByDomain("bridge") returns 8 entries with correct names', () => {
    const bridgeTools = getToolsByDomain('bridge');
    expect(bridgeTools).toHaveLength(8);
    const names = bridgeTools.map((e) => e.name);
    expect(names).toContain('external_memory_put');
    expect(names).toContain('external_memory_get');
    expect(names).toContain('external_memory_search');
    expect(names).toContain('external_memory_delete');
    expect(names).toContain('external_memory_compact');
    expect(names).toContain('public_agent_list');
    expect(names).toContain('public_agent_invoke');
    expect(names).toContain('public_system_info');
  });

  it('getToolsByDomain("app") returns 5 entries', () => {
    const appTools = getToolsByDomain('app');
    expect(appTools).toHaveLength(5);
    const names = appTools.map((e) => e.name);
    expect(names).toContain('health_report');
    expect(names).toContain('health_heartbeat');
    expect(names).toContain('credentials_store');
    expect(names).toContain('credentials_inject');
    expect(names).toContain('credentials_revoke');
  });

  it('getToolsByDomain("agent") returns 43 entries', () => {
    const agentTools = getToolsByDomain('agent');
    expect(agentTools).toHaveLength(43);
  });
});
