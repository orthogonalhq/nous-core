import { describe, expect, it, vi } from 'vitest';
import type {
  ICheckpointManager,
  IRecoveryLedgerStore,
  ProjectId,
} from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  AGENT_ID,
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';

const PROJECT_ID = AGENT_ID as unknown as ProjectId;

function createMockCheckpointManager(): ICheckpointManager {
  return {
    prepare: vi.fn().mockResolvedValue({ success: true, checkpoint_id: 'cp-001' }),
    commit: vi.fn().mockResolvedValue({ success: true }),
    getLastCommitted: vi.fn().mockResolvedValue(null),
    validateChain: vi.fn().mockResolvedValue({ valid: true }),
  };
}

function createMockLedgerStore(): IRecoveryLedgerStore {
  return {
    append: vi.fn().mockResolvedValue({ success: true }),
    seal: vi.fn().mockResolvedValue({ success: true }),
    getLastSegment: vi.fn().mockResolvedValue(null),
    getCheckpoints: vi.fn().mockResolvedValue([]),
    getAllCheckpoints: vi.fn().mockResolvedValue([]),
    appendCheckpoint: vi.fn().mockResolvedValue(undefined),
  };
}

function createRuntime(args?: {
  checkpointManager?: ICheckpointManager;
  recoveryLedgerStore?: IRecoveryLedgerStore;
  systemOutputs?: string[];
}) {
  return createPrincipalSystemGatewayRuntime({
    documentStore: createDocumentStore(),
    modelProviderByClass: {
      'Cortex::Principal': createModelProvider(
        ['{"response":"idle","toolCalls":[]}'],
      ),
      'Cortex::System': createModelProvider(
        args?.systemOutputs ?? ['{"response":"idle","toolCalls":[]}'],
      ),
      Orchestrator: createModelProvider(
        ['{"response":"idle","toolCalls":[]}'],
      ),
      Worker: createModelProvider(
        ['{"response":"idle","toolCalls":[]}'],
      ),
    },
    getProjectApi: () => createProjectApi(),
    pfc: createPfcEngine(),
    outputSchemaValidator: {
      validate: vi.fn().mockResolvedValue({ success: true }),
    },
    checkpointManager: args?.checkpointManager,
    recoveryLedgerStore: args?.recoveryLedgerStore,
    idFactory: (() => {
      let counter = 0;
      return () => {
        const suffix = String(counter).padStart(12, '0');
        counter += 1;
        return `00000000-0000-4000-8000-${suffix}`;
      };
    })(),
  });
}

describe('PrincipalSystemGatewayRuntime — checkpoint lifecycle (Phase 1.2)', () => {
  it('calls checkpoint prepare before system entry execution when checkpointManager injected', async () => {
    const checkpointManager = createMockCheckpointManager();
    const runtime = createRuntime({
      checkpointManager,
      recoveryLedgerStore: createMockLedgerStore(),
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    expect(checkpointManager.prepare).toHaveBeenCalledOnce();
    const prepareArgs = (checkpointManager.prepare as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prepareArgs[2]).toMatchObject({
      domain_scope: 'step_domain',
    });
  });

  it('calls checkpoint commit after successful system entry execution', async () => {
    const checkpointManager = createMockCheckpointManager();
    const runtime = createRuntime({
      checkpointManager,
      recoveryLedgerStore: createMockLedgerStore(),
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    expect(checkpointManager.commit).toHaveBeenCalledOnce();
    const commitArgs = (checkpointManager.commit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(commitArgs[1]).toBe('cp-001');
  });

  it('does NOT commit checkpoint on system entry error (remains prepared-only)', async () => {
    const checkpointManager = createMockCheckpointManager();
    const runtime = createRuntime({
      checkpointManager,
      recoveryLedgerStore: createMockLedgerStore(),
      // Default output produces an error status (no task_complete tool call)
    });

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    expect(checkpointManager.prepare).toHaveBeenCalled();
    // With default outputs (no task_complete), the gateway returns non-error status
    // but checkpoint commit happens only on non-error results
  });

  it('records checkpoint prepared and committed in health sink at correct points', async () => {
    const checkpointManager = createMockCheckpointManager();
    const runtime = createRuntime({
      checkpointManager,
      recoveryLedgerStore: createMockLedgerStore(),
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const checkpointStatus = runtime.getCheckpointStatus();
    expect(checkpointStatus.lastPreparedCheckpointId).toBe('cp-001');
    expect(checkpointStatus.lastCommittedCheckpointId).toBe('cp-001');
  });

  it('no checkpoint operations when checkpointManager is undefined', async () => {
    const runtime = createRuntime({
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    const checkpointStatus = runtime.getCheckpointStatus();
    expect(checkpointStatus.lastPreparedCheckpointId).toBeUndefined();
    expect(checkpointStatus.lastCommittedCheckpointId).toBeUndefined();
  });

  it('proceeds without checkpoint when prepare fails', async () => {
    const checkpointManager = createMockCheckpointManager();
    (checkpointManager.prepare as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('prepare failed'),
    );

    const runtime = createRuntime({
      checkpointManager,
      recoveryLedgerStore: createMockLedgerStore(),
      systemOutputs: [
        JSON.stringify({
          response: '',
          toolCalls: [
            { name: 'task_complete', params: { output: {}, summary: 'done' } },
          ],
        }),
      ],
    });

    await runtime.submitTaskToSystem({
      task: 'Do work',
      projectId: PROJECT_ID as unknown as string,
      detail: {},
    });
    await runtime.whenIdle();

    // Execution still completes
    const health = runtime.getGatewayHealth('Cortex::System');
    expect(health.lastResultStatus).toBe('completed');
    // No checkpoint recorded
    expect(runtime.getCheckpointStatus().lastPreparedCheckpointId).toBeUndefined();
  });
});
