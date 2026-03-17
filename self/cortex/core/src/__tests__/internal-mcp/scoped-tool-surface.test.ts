import { describe, expect, it } from 'vitest';
import {
  createScopedMcpToolSurface,
  getVisibleInternalMcpTools,
} from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  PROJECT_ID,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

describe('ScopedMcpToolSurface', () => {
  it('filters tool visibility structurally by agent class', async () => {
    const workerSurface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
    });
    const principalSurface = createScopedMcpToolSurface({
      agentClass: 'Cortex::Principal',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
      },
    });

    const workerTools = (await workerSurface.listTools()).map((tool) => tool.name);
    const principalTools = (await principalSurface.listTools()).map(
      (tool) => tool.name,
    );

    expect(workerTools).toContain('task_complete');
    expect(workerTools).toContain('tool_execute');
    expect(workerTools).toContain('workflow_list');
    expect(workerTools).toContain('workflow_status');
    expect(workerTools).not.toContain('workflow_start');
    expect(workerTools).not.toContain('dispatch_agent');
    expect(workerTools).not.toContain('memory_write');
    expect(workerTools).not.toContain('promoted_memory_promote');

    expect(principalTools).toContain('memory_search');
    expect(principalTools).toContain('artifact_retrieve');
    expect(principalTools).toContain('workflow_inspect');
    expect(principalTools).toContain('workflow_status');
    expect(principalTools).not.toContain('workflow_start');
    expect(principalTools).not.toContain('task_complete');
    expect(principalTools).not.toContain('dispatch_agent');
    expect(principalTools).not.toContain('promoted_memory_promote');
  });

  it('keeps unauthorized and lifecycle-only tools unavailable at execution time', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
    });

    await expect(
      surface.executeTool('dispatch_agent', {}, {
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow('not available');
  });

  it('exposes the same visible catalog through the helper projection', () => {
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('dispatch_agent');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_list');
    expect(getVisibleInternalMcpTools('Orchestrator')).not.toContain('workflow_pause');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('dispatch_agent');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('promoted_memory_promote');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('workflow_cancel');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('promoted_memory_promote');
  });
});
