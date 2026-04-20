import { afterEach, describe, expect, it, vi } from 'vitest';
import { NousError } from '@nous/shared';
import {
  createScopedMcpToolSurface,
  getVisibleInternalMcpTools,
  registerDynamicInternalMcpTool,
  unregisterDynamicInternalMcpTool,
} from '../../internal-mcp/index.js';
import type { ToolErrorPayload } from '../../internal-mcp/tool-error-helpers.js';
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
    expect(workerTools).not.toContain('workflow_execute_node');
    expect(workerTools).not.toContain('workflow_complete_node');
    expect(workerTools).not.toContain('dispatch_orchestrator');
    expect(workerTools).not.toContain('dispatch_worker');
    expect(workerTools).not.toContain('memory_write');
    expect(workerTools).not.toContain('promoted_memory_promote');

    expect(principalTools).toContain('memory_search');
    expect(principalTools).toContain('artifact_retrieve');
    expect(principalTools).toContain('workflow_inspect');
    expect(principalTools).toContain('workflow_status');
    expect(principalTools).not.toContain('workflow_start');
    expect(principalTools).not.toContain('workflow_execute_node');
    expect(principalTools).not.toContain('workflow_complete_node');
    expect(principalTools).toContain('task_complete');
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
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_execute_node');
    expect(getVisibleInternalMcpTools('Orchestrator')).toContain('workflow_complete_node');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('dispatch_orchestrator');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('dispatch_worker');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('workflow_execute_node');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('workflow_complete_node');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('dispatch_orchestrator');
    expect(getVisibleInternalMcpTools('Cortex::System')).not.toContain('dispatch_worker');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('promoted_memory_promote');
    expect(getVisibleInternalMcpTools('Cortex::System')).toContain('workflow_cancel');
    expect(getVisibleInternalMcpTools('Worker')).not.toContain('promoted_memory_promote');
  });

  it('merges lease granted_tools with baseline grants (additive-only)', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
      lease: {
        lease_id: '550e8400-e29b-41d4-a716-446655440200' as never,
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation' as never,
        entrypoint_ref: 'test',
        sop_ref: 'test',
        scope_ref: 'test',
        context_profile: 'test',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
        granted_tools: ['workflow_create', 'workflow_update'],
      },
    });

    const tools = (await surface.listTools()).map((t) => t.name);
    // Baseline Worker tools should still be present
    expect(tools).toContain('task_complete');
    expect(tools).toContain('tool_execute');
    // Lease-granted tools should also be present
    expect(tools).toContain('workflow_create');
    expect(tools).toContain('workflow_update');
    // Tools not in baseline or lease should not be present
    expect(tools).not.toContain('dispatch_orchestrator');
    expect(tools).not.toContain('dispatch_worker');
  });

  it('produces baseline-only grants when lease has no granted_tools field', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
      lease: {
        lease_id: '550e8400-e29b-41d4-a716-446655440200' as never,
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation' as never,
        entrypoint_ref: 'test',
        sop_ref: 'test',
        scope_ref: 'test',
        context_profile: 'test',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
      },
    });

    const tools = (await surface.listTools()).map((t) => t.name);
    expect(tools).toContain('task_complete');
    expect(tools).not.toContain('workflow_create');
    expect(tools).not.toContain('dispatch_orchestrator');
  });

  it('allows executeTool on lease-granted tool (not rejected by authorization)', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
      lease: {
        lease_id: '550e8400-e29b-41d4-a716-446655440200' as never,
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation' as never,
        entrypoint_ref: 'test',
        sop_ref: 'test',
        scope_ref: 'test',
        context_profile: 'test',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
        granted_tools: ['workflow_create'],
      },
    });

    // workflow_create is NOT in Worker baseline but IS in lease grants.
    // The handler may throw SERVICE_UNAVAILABLE (missing deps), but NOT TOOL_NOT_AVAILABLE.
    // This verifies the authorization layer accepts the lease-granted tool.
    try {
      await surface.executeTool('workflow_create', {}, { projectId: PROJECT_ID });
    } catch (error: unknown) {
      const err = error as { code?: string };
      // Should NOT be TOOL_NOT_AVAILABLE — the tool is authorized via lease
      expect(err.code).not.toBe('TOOL_NOT_AVAILABLE');
    }
  });

  it('rejects executeTool on tool not in baseline or lease grants', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
      lease: {
        lease_id: '550e8400-e29b-41d4-a716-446655440200' as never,
        project_run_id: '550e8400-e29b-41d4-a716-446655440201',
        workmode_id: 'system:implementation' as never,
        entrypoint_ref: 'test',
        sop_ref: 'test',
        scope_ref: 'test',
        context_profile: 'test',
        ttl: 3600,
        issued_by: 'nous_cortex',
        issued_at: '2026-04-09T00:00:00.000Z',
        expires_at: '2026-04-09T01:00:00.000Z',
        revocation_ref: null,
        granted_tools: ['workflow_create'],
      },
    });

    await expect(
      surface.executeTool('workflow_cancel', {}, { projectId: PROJECT_ID }),
    ).rejects.toThrow('not available');
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

  // ── SP 1.13 RC-1 enriched-error contract regressions ─────────────────────
  // All four "Tool ${name} is not available..." throw sites in
  // scoped-tool-surface.ts now flow through buildUnknownToolError. The four
  // sites correspond to: (1) catalog miss + dynamic miss, (2) dynamic-entry
  // visibility miss, (3) secondary catalog-miss guard (unreachable in practice
  // because of guard #1, but covered by the existing throw), (4) authorization-
  // matrix miss. Each throw must produce the same enriched contract.
  describe('SP 1.13 RC-1 enriched unknown-tool contract', () => {
    it('throw site #1 — totally unknown name produces enriched NousError', async () => {
      const surface = createScopedMcpToolSurface({
        agentClass: 'Cortex::Principal',
        agentId: AGENT_ID,
        deps: {
          getProjectApi: () => createProjectApi(),
        },
      });

      let captured: NousError | undefined;
      try {
        await surface.executeTool('this_tool_does_not_exist', {}, { projectId: PROJECT_ID });
      } catch (e) {
        captured = e as NousError;
      }
      expect(captured).toBeInstanceOf(NousError);
      expect(captured?.code).toBe('TOOL_NOT_AVAILABLE');
      expect(captured?.message).toContain('Available tools:');
      const ctx = captured?.context as ToolErrorPayload;
      expect(ctx.tool_error_kind).toBe('unknown_tool');
      expect(ctx.requested_tool).toBe('this_tool_does_not_exist');
      // Available tools list should reflect the calling agent class's authorized set.
      expect(ctx.available_tools).toBeDefined();
      expect((ctx.available_tools ?? []).length).toBeGreaterThan(0);
    });

    it('throw site #2 — dynamic-entry visibility miss produces enriched NousError', async () => {
      const toolName = 'app:test.dynamic_visibility_only_worker';
      registerDynamicInternalMcpTool({
        name: toolName,
        sessionId: 'session-vis',
        appId: 'app:test',
        visibleTo: ['Worker'], // Visible to Worker but NOT Principal
        definition: {
          name: toolName,
          version: '1.0.0',
          description: 'Test dynamic tool with restricted visibility.',
          inputSchema: {},
          outputSchema: {},
          capabilities: ['read'],
          permissionScope: 'project',
        },
        execute: vi.fn(),
      });
      try {
        const principalSurface = createScopedMcpToolSurface({
          agentClass: 'Cortex::Principal',
          agentId: AGENT_ID,
          deps: { getProjectApi: () => createProjectApi() },
        });

        let captured: NousError | undefined;
        try {
          await principalSurface.executeTool(toolName, {}, { projectId: PROJECT_ID });
        } catch (e) {
          captured = e as NousError;
        }
        expect(captured).toBeInstanceOf(NousError);
        expect(captured?.code).toBe('TOOL_NOT_AVAILABLE');
        expect(captured?.message).toContain('Available tools:');
        const ctx = captured?.context as ToolErrorPayload;
        expect(ctx.tool_error_kind).toBe('unknown_tool');
        expect(ctx.requested_tool).toBe(toolName);
      } finally {
        unregisterDynamicInternalMcpTool(toolName);
      }
    });

    it('throw site #4 — authorization-matrix miss (catalog tool not granted) produces enriched NousError', async () => {
      // Worker is NOT authorized for workflow_create at baseline.
      const surface = createScopedMcpToolSurface({
        agentClass: 'Worker',
        agentId: AGENT_ID,
        deps: {
          getProjectApi: () => createProjectApi(),
          pfc: createPfcEngine(),
        },
      });

      let captured: NousError | undefined;
      try {
        await surface.executeTool('workflow_create', {}, { projectId: PROJECT_ID });
      } catch (e) {
        captured = e as NousError;
      }
      expect(captured).toBeInstanceOf(NousError);
      expect(captured?.code).toBe('TOOL_NOT_AVAILABLE');
      expect(captured?.message).toContain('Available tools:');
      const ctx = captured?.context as ToolErrorPayload;
      expect(ctx.tool_error_kind).toBe('unknown_tool');
      expect(ctx.requested_tool).toBe('workflow_create');
    });

    it('"Did you mean: workflow_list" suggestion fires for the BT R5 hallucinated name', async () => {
      const surface = createScopedMcpToolSurface({
        agentClass: 'Cortex::Principal',
        agentId: AGENT_ID,
        deps: { getProjectApi: () => createProjectApi() },
      });

      let captured: NousError | undefined;
      try {
        await surface.executeTool(
          'workflow_manager.list_workflows',
          {},
          { projectId: PROJECT_ID },
        );
      } catch (e) {
        captured = e as NousError;
      }
      expect(captured?.message).toContain('Did you mean:');
      expect(captured?.message).toContain('workflow_list');
    });
  });
});
