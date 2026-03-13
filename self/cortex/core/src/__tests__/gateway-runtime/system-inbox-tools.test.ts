import { describe, expect, it, vi } from 'vitest';
import {
  createPrincipalCommunicationToolSurface,
  INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME,
  SUBMIT_TASK_TO_SYSTEM_TOOL_NAME,
} from '../../gateway-runtime/index.js';

describe('system inbox communication tools', () => {
  it('adds the Principal communication overlay and returns the read-only replica', async () => {
    const surface = createPrincipalCommunicationToolSurface({
      baseToolSurface: {
        listTools: vi.fn().mockResolvedValue([
          {
            name: 'memory_search',
            version: '1.0.0',
            description: 'memory_search',
            inputSchema: {},
            outputSchema: {},
            capabilities: [],
            permissionScope: 'project',
          },
        ]),
        executeTool: vi.fn(),
      },
      submissionService: {
        submitTask: vi.fn().mockResolvedValue({
          runId: '00000000-0000-4000-8000-000000000001',
          dispatchRef: 'dispatch:1',
          acceptedAt: '2026-03-12T20:00:00.000Z',
          source: 'principal_tool',
        }),
        injectDirective: vi.fn().mockResolvedValue({
          runId: '00000000-0000-4000-8000-000000000002',
          dispatchRef: 'dispatch:2',
          acceptedAt: '2026-03-12T20:00:01.000Z',
          source: 'principal_tool',
        }),
      },
      replicaReader: {
        getReplica: () => ({
          bootStatus: 'ready',
          inboxReady: true,
          pendingSystemRuns: 0,
          issueCodes: [],
          visibleTools: ['dispatch_agent'],
        }),
      },
    });

    const tools = await surface.listTools();
    const result = await surface.executeTool(SUBMIT_TASK_TO_SYSTEM_TOOL_NAME, {
      task: 'Review queue',
      detail: { source: 'test' },
    });

    expect(tools.map((tool) => tool.name)).toContain(SUBMIT_TASK_TO_SYSTEM_TOOL_NAME);
    expect(tools.map((tool) => tool.name)).toContain(INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME);
    expect(result.success).toBe(true);
    expect((result.output as { systemReplica: { bootStatus: string } }).systemReplica.bootStatus).toBe(
      'ready',
    );
  });

  it('rejects malformed directive payloads before reaching System', async () => {
    const injectDirective = vi.fn();
    const surface = createPrincipalCommunicationToolSurface({
      baseToolSurface: {
        listTools: vi.fn().mockResolvedValue([]),
        executeTool: vi.fn(),
      },
      submissionService: {
        submitTask: vi.fn(),
        injectDirective,
      },
      replicaReader: {
        getReplica: () => ({
          bootStatus: 'ready',
          inboxReady: true,
          pendingSystemRuns: 0,
          issueCodes: [],
          visibleTools: [],
        }),
      },
    });

    await expect(
      surface.executeTool(INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME, {
        priority: 'high',
      }),
    ).rejects.toThrow();
    expect(injectDirective).not.toHaveBeenCalled();
  });
});
