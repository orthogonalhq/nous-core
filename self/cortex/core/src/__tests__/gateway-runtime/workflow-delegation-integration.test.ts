import { describe, expect, it, vi } from 'vitest';
import {
  createPrincipalCommunicationToolSurface,
  SUBMIT_TASK_TO_SYSTEM_TOOL_NAME,
} from '../../gateway-runtime/index.js';

describe('workflow delegation integration — submit_task_to_system with workflow payload', () => {
  // ── Tier 3: Integration Tests ──────────────────────────────────────────

  it('accepts a workflow-flavored task payload and returns a submission receipt', async () => {
    const submitTask = vi.fn().mockResolvedValue({
      runId: '00000000-0000-4000-8000-000000000099',
      dispatchRef: 'dispatch:wf-1',
      acceptedAt: '2026-04-10T12:00:00.000Z',
      source: 'principal_tool',
    });

    const surface = createPrincipalCommunicationToolSurface({
      baseToolSurface: {
        listTools: vi.fn().mockResolvedValue([]),
        executeTool: vi.fn(),
      },
      submissionService: {
        submitTask,
        injectDirective: vi.fn(),
      },
      replicaReader: {
        getReplica: () => ({
          bootStatus: 'ready',
          inboxReady: true,
          pendingSystemRuns: 0,
          backlogAnalytics: {
            queuedCount: 0,
            activeCount: 0,
            suspendedCount: 0,
            activeCapacity: 1,
            windowStart: '2026-04-10T11:00:00.000Z',
            windowEnd: '2026-04-10T11:00:00.000Z',
            completedInWindow: 0,
            failedInWindow: 0,
            avgWaitMs: 0,
            avgExecutionMs: 0,
            p95WaitMs: 0,
            peakQueueDepth: 0,
            pressureTrend: 'stable',
          },
          issueCodes: [],
          visibleTools: [],
        }),
      },
    });

    const workflowTaskPayload = {
      task: "Start workflow run. Call workflow_start with definition_id 'deploy-def-123' for project 'proj-456'.",
      projectId: '00000000-0000-4000-8000-000000000456',
      detail: { tool: 'workflow_start', definition_id: 'deploy-def-123' },
    };

    const result = await surface.executeTool(SUBMIT_TASK_TO_SYSTEM_TOOL_NAME, workflowTaskPayload);

    // Assert result contains receipt fields (spread directly into output)
    expect(result.success).toBe(true);
    const output = result.output as {
      runId: string;
      dispatchRef: string;
      acceptedAt: string;
      source: string;
      systemReplica: { bootStatus: string };
    };
    expect(output.runId).toBe('00000000-0000-4000-8000-000000000099');
    expect(output.dispatchRef).toBe('dispatch:wf-1');
    expect(output.acceptedAt).toBe('2026-04-10T12:00:00.000Z');
    expect(output.source).toBe('principal_tool');

    // Assert submissionService.submitTask was called with the workflow task
    expect(submitTask).toHaveBeenCalledTimes(1);
    expect(submitTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: workflowTaskPayload.task,
        detail: workflowTaskPayload.detail,
      }),
    );
  });
});
