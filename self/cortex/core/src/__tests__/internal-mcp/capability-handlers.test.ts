import { describe, expect, it, vi } from 'vitest';
import {
  createCapabilityHandlers,
  createScopedMcpToolSurface,
} from '../../internal-mcp/index.js';
import {
  AGENT_ID,
  DEFAULT_TOOLS,
  PROJECT_ID,
  TRACE_ID,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

describe('Internal MCP capability handlers', () => {
  it('denies memory_write when PFC rejects the candidate', async () => {
    const projectApi = createProjectApi();
    const pfc = createPfcEngine({
      evaluateMemoryWrite: vi.fn().mockResolvedValue({
        approved: false,
        reason: 'denied',
        confidence: 1,
      }),
    });
    const surface = createScopedMcpToolSurface({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => projectApi,
        pfc,
      },
    });

    await expect(
      surface.executeTool(
        'memory_write',
        {
          content: 'important fact',
          type: 'fact',
          scope: 'project',
          confidence: 0.9,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: TRACE_ID,
            source: 'test',
            timestamp: '2026-03-12T19:00:00.000Z',
          },
          tags: [],
        },
        {
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
        },
      ),
    ).rejects.toThrow('denied');

    expect(projectApi.memory.write).not.toHaveBeenCalled();
  });

  it('returns external tool definitions through tool_list instead of the internal catalog', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () =>
          createProjectApi({
            tool: {
              execute: vi.fn(),
              list: vi.fn().mockResolvedValue(DEFAULT_TOOLS),
            },
          }),
        pfc: createPfcEngine(),
      },
    });

    const result = await surface.executeTool(
      'tool_list',
      {},
      {
        projectId: PROJECT_ID,
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual(DEFAULT_TOOLS);
    expect(JSON.stringify(result.output)).not.toContain('memory_search');
  });

  it('fails closed when a project-scoped capability lacks project context', async () => {
    const surface = createScopedMcpToolSurface({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      deps: {
        getProjectApi: () => createProjectApi(),
        pfc: createPfcEngine(),
      },
    });

    await expect(surface.executeTool('artifact_store', {
      name: 'report.json',
      mimeType: 'application/json',
      data: '{}',
      contentEncoding: 'utf8',
      tags: [],
    })).rejects.toThrow('requires execution.projectId');
  });

  it('delegates public agent capabilities through the public surface seam', async () => {
    const publicMcpSurfaceService = {
      listAgents: vi.fn().mockResolvedValue([
        {
          agentId: 'engineering.workflow',
          title: 'Engineering Workflow',
          description: 'Public-safe engineering orchestration.',
          inputModes: ['text'],
          memoryBinding: {
            supported: false,
            readTiers: [],
            writeTiers: [],
          },
          execution: {
            taskSupport: 'optional',
            asyncThreshold: 'long_running_only',
          },
        },
      ]),
      invokeAgent: vi.fn().mockResolvedValue({
        mode: 'completed',
        runId: 'run-1',
        outputs: [{ type: 'text', text: 'done' }],
      }),
      getTask: vi.fn(),
      getTaskResult: vi.fn(),
      getSystemInfo: vi.fn().mockResolvedValue({
        server: {
          name: 'Nous Public MCP',
          phase: 'phase-13.4',
          backendMode: 'development',
          protocolVersion: '2025-11-25',
        },
        features: {
          publicAgents: true,
          publicSystemInfo: true,
          publicTasks: true,
          publicCompactAsync: true,
        },
        limits: {
          maxInvokeInputBytes: 8192,
          maxTaskPollWindowSeconds: 300,
        },
        quotas: {
          invokePerMinute: 10,
        },
        tasks: {
          supportedMethods: ['tasks/get', 'tasks/result'],
          toolSupport: {
            'ortho.agents.v1.invoke': 'optional',
          },
        },
      }),
    };
    const handlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        publicMcpSurfaceService: publicMcpSurfaceService as any,
      },
    });

    const listResult = await handlers.public_agent_list({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      jsonrpc: '2.0',
      protocolVersion: '2025-11-25',
      method: 'tools/call',
      toolName: 'ortho.agents.v1.list',
      arguments: {},
      subject: {
        class: 'ExternalClient',
        clientId: 'client-1',
        clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        scopes: ['ortho.system.read'],
        audience: 'urn:nous:ortho:mcp',
      },
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect(listResult.success).toBe(true);
    expect(publicMcpSurfaceService.listAgents).toHaveBeenCalled();
  });

  it('restricts promoted memory capabilities to Cortex::System', async () => {
    const promotedMemoryBridgeService = {
      promote: vi.fn().mockResolvedValue({ id: 'promoted-1' }),
      demote: vi.fn(),
      get: vi.fn(),
      search: vi.fn(),
    };
    const workerHandlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: AGENT_ID as any,
      deps: {
        promotedMemoryBridgeService: promotedMemoryBridgeService as any,
      },
    });
    const systemHandlers = createCapabilityHandlers({
      agentClass: 'Cortex::System',
      agentId: AGENT_ID as any,
      deps: {
        promotedMemoryBridgeService: promotedMemoryBridgeService as any,
      },
    });

    await expect(
      workerHandlers.promoted_memory_promote({
        sourceNamespace:
          'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        sourceRecordId: 'entry-1',
        rationale: 'promote',
      }),
    ).rejects.toThrow('restricted to Cortex::System');

    const result = await systemHandlers.promoted_memory_promote({
      sourceNamespace:
        'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      sourceRecordId: 'entry-1',
      rationale: 'promote',
    });

    expect(result.success).toBe(true);
    expect(promotedMemoryBridgeService.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRecordId: 'entry-1',
      }),
    );
  });
});
