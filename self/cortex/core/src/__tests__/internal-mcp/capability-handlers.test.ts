import { describe, expect, it, vi } from 'vitest';
import { createScopedMcpToolSurface } from '../../internal-mcp/index.js';
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
});
