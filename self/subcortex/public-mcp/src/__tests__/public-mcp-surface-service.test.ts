import { describe, expect, it, vi } from 'vitest';
import type { PublicMcpSubject } from '@nous/shared';
import { PublicMcpSurfaceService } from '../public-mcp-surface-service.js';
import { PublicMcpTaskProjectionStore } from '../public-mcp-task-projection-store.js';
import { AuditProjectionStore } from '../audit-projection-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const SUBJECT: PublicMcpSubject = {
  class: 'ExternalClient' as const,
  clientId: 'client-1',
  clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  scopes: ['ortho.agents.invoke', 'ortho.system.read'],
  audience: 'urn:nous:ortho:mcp',
};

describe('PublicMcpSurfaceService', () => {
  it('lists allowlisted public agents and projects public-safe system info', async () => {
    const documentStore = createMemoryDocumentStore();
    const service = new PublicMcpSurfaceService({
      runtimeAdapter: {
        runAgent: vi.fn(),
      },
      taskStore: new PublicMcpTaskProjectionStore(documentStore),
      auditStore: new AuditProjectionStore(documentStore),
      publicAgents: [
        {
          catalog: {
            agentId: 'engineering.workflow',
            title: 'Engineering Workflow',
            description: 'Public-safe engineering orchestration.',
            inputModes: ['text', 'json'],
            memoryBinding: {
              supported: true,
              readTiers: ['ltm'],
              writeTiers: ['stm'],
            },
            execution: {
              taskSupport: 'optional',
              asyncThreshold: 'long_running_only',
            },
          },
          targetClass: 'Orchestrator',
          buildTaskInstructions: () => 'handle request',
        },
      ],
    });

    const agents = await service.listAgents({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      subject: SUBJECT,
      requestedAt: '2026-03-14T00:00:00.000Z',
    });
    const systemInfo = await service.getSystemInfo({
      requestId: '550e8400-e29b-41d4-a716-446655440001',
      subject: SUBJECT,
      requestedAt: '2026-03-14T00:00:00.000Z',
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]?.agentId).toBe('engineering.workflow');
    expect(systemInfo.tasks.supportedMethods).toEqual(['tasks/get', 'tasks/result']);
  });

  it('creates async public invoke tasks and serves the completed result', async () => {
    const documentStore = createMemoryDocumentStore();
    const service = new PublicMcpSurfaceService({
      runtimeAdapter: {
        runAgent: vi.fn().mockResolvedValue({
          runId: 'run-1',
          status: 'completed',
          output: { response: 'done' },
        }),
      },
      taskStore: new PublicMcpTaskProjectionStore(documentStore),
      auditStore: new AuditProjectionStore(documentStore),
      publicAgents: [
        {
          catalog: {
            agentId: 'engineering.workflow',
            title: 'Engineering Workflow',
            description: 'Public-safe engineering orchestration.',
            inputModes: ['text'],
            memoryBinding: {
              supported: true,
              readTiers: ['ltm'],
              writeTiers: ['stm'],
            },
            execution: {
              taskSupport: 'optional',
              asyncThreshold: 'long_running_only',
            },
          },
          targetClass: 'Orchestrator',
          buildTaskInstructions: () => 'handle request',
          buildPayload: (request) => request.arguments.input,
        },
      ],
    });

    const invoke = await service.invokeAgent({
      requestId: '550e8400-e29b-41d4-a716-446655440002',
      subject: SUBJECT,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        agentId: 'engineering.workflow',
        input: {
          type: 'text',
          text: 'hello',
        },
        executionMode: 'async',
      },
    });

    expect(invoke.mode).toBe('task');
    if (invoke.mode !== 'task') {
      throw new Error('expected task result');
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    const task = await service.getTask({
      requestId: '550e8400-e29b-41d4-a716-446655440003',
      subject: SUBJECT,
      requestedAt: '2026-03-14T00:00:01.000Z',
      taskId: invoke.task.taskId,
    });
    const result = await service.getTaskResult({
      requestId: '550e8400-e29b-41d4-a716-446655440004',
      subject: SUBJECT,
      requestedAt: '2026-03-14T00:00:01.000Z',
      taskId: invoke.task.taskId,
    });

    expect(task?.status).toBe('completed');
    expect(result?.status).toBe('completed');
    if (!result?.result) {
      throw new Error('expected completed task result');
    }

    expect((result.result as { outputs: Array<{ text: string }> }).outputs[0]?.text).toBe(
      'done',
    );
  });
});
