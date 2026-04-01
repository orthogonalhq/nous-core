import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createScopedMcpToolSurface,
  getVisibleInternalMcpTools,
  registerDynamicInternalMcpTool,
  unregisterDynamicInternalMcpTool,
} from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  PROJECT_ID,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

describe('ScopedMcpToolSurface', () => {
  const dynamicToolNames: string[] = [];

  afterEach(() => {
    for (const name of dynamicToolNames.splice(0)) {
      unregisterDynamicInternalMcpTool(name);
    }
  });

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
    expect(workerTools).not.toContain('dispatch_orchestrator');
    expect(workerTools).not.toContain('dispatch_worker');
    expect(workerTools).not.toContain('memory_write');
    expect(workerTools).not.toContain('promoted_memory_promote');

    expect(principalTools).toContain('memory_search');
    expect(principalTools).toContain('artifact_retrieve');
    expect(principalTools).toContain('workflow_inspect');
    expect(principalTools).toContain('workflow_status');
    expect(principalTools).not.toContain('workflow_start');
    expect(principalTools).not.toContain('task_complete');
    expect(principalTools).not.toContain('dispatch_orchestrator');
    expect(principalTools).not.toContain('dispatch_worker');
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
      surface.executeTool('dispatch_orchestrator', {}, {
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow('not available');
  });

  it('rejects Principal execution of dispatch_orchestrator at the surface level', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Cortex::Principal',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
      },
    });

    await expect(
      surface.executeTool('dispatch_orchestrator', {}, {
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow('not available');
  });

  it('rejects Principal execution of task_complete at the surface level', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Cortex::Principal',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
      },
    });

    await expect(
      surface.executeTool('task_complete', {}, {
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow('not available');
  });

  it('exposes the same visible catalog through the helper projection', () => {
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('dispatch_orchestrator');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('dispatch_worker');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_list');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_start');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_pause');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_resume');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('dispatch_orchestrator');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('dispatch_worker');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('dispatch_orchestrator');
    expect(getVisibleInternalMcpTools('Cortex::System')).not.toContain('dispatch_worker');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('promoted_memory_promote');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('workflow_cancel');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('promoted_memory_promote');
  });

  it('surfaces runtime-registered dynamic app tools only to authorized agent classes', async () => {
    const toolName = 'app:weather.get_forecast.dynamic';
    dynamicToolNames.push(toolName);
    const execute = vi.fn().mockResolvedValue({
      success: true,
      output: { forecast: 'sunny' },
      durationMs: 0,
    });
    registerDynamicInternalMcpTool({
      name: toolName,
      sessionId: 'session-1',
      appId: 'app:weather',
      visibleTo: ['Worker'],
      definition: {
        name: toolName,
        version: '1.0.0',
        description: 'Dynamic app tool',
        inputSchema: {},
        outputSchema: {},
        capabilities: ['read'],
        permissionScope: 'project',
      },
      execute,
    });

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
    expect(workerTools).toContain(toolName);
    expect(getVisibleInternalMcpTools('Worker')).toContain(toolName);
    expect(getVisibleInternalMcpTools('Cortex::Principal')).not.toContain(toolName);

    const result = await workerSurface.executeTool(toolName, {
      city: 'San Francisco',
    });
    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      { city: 'San Francisco' },
      undefined,
    );

    await expect(principalSurface.executeTool(toolName, {})).rejects.toThrow(
      'not available',
    );
  });
});
