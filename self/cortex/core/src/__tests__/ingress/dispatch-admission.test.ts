/**
 * Ingress dispatch admission behavior tests.
 */
import { describe, expect, it } from 'vitest';
import {
  IngressDispatchAdmission,
  InMemoryIngressIdempotencyStore,
} from '../../ingress/index.js';
import type {
  IOpctlService,
  IProjectStore,
  IWorkflowEngine,
  IngressTriggerEnvelope,
  ProjectConfig,
} from '@nous/shared';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

const projectConfig = {
  id: UUID,
  name: 'Ingress Project',
  type: 'hybrid',
  pfcTier: 2,
  memoryAccessPolicy: {
    canReadFrom: 'all',
    canBeReadBy: 'all',
    inheritsGlobal: true,
  },
  escalationChannels: ['in-app'],
  workflow: {
    defaultWorkflowDefinitionId: UUID,
    definitions: [],
  },
  retrievalBudgetTokens: 500,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as ProjectConfig;

function makeEnvelope(
  overrides: Partial<IngressTriggerEnvelope>,
): IngressTriggerEnvelope {
  return {
    trigger_id: UUID,
    trigger_type: 'scheduler',
    source_id: 'scheduler-1',
    project_id: UUID as import('@nous/shared').ProjectId,
    workflow_ref: 'workflow:test',
    workmode_id: 'system:implementation',
    event_name: 'scheduled_run',
    payload_ref: `sha256:${'a'.repeat(64)}`,
    idempotency_key: 'key-1',
    nonce: 'nonce-1',
    occurred_at: NOW,
    received_at: NOW,
    auth_context_ref: null,
    trace_parent: null,
    requested_delivery_mode: 'none',
    ...overrides,
  };
}

function createProjectStore(): IProjectStore {
  return {
    create: async () => projectConfig.id,
    get: async () => projectConfig,
    list: async () => [projectConfig],
    listArchived: async () => [],
    update: async () => undefined,
    archive: async () => undefined,
    unarchive: async () => undefined,
  };
}

function createWorkflowEngine(overrides: Partial<IWorkflowEngine> = {}): IWorkflowEngine {
  return {
    resolveDefinition: async () => {
      throw new Error('not used');
    },
    deriveGraph: async () => {
      throw new Error('not used');
    },
    evaluateAdmission: async () => {
      throw new Error('not used');
    },
    start: async (request) =>
      ({
        status: 'started',
        graph: {
          workflowDefinitionId: UUID,
          projectId: UUID,
          version: '1.0.0',
          graphDigest: 'a'.repeat(64),
          entryNodeIds: [],
          topologicalOrder: [],
          nodes: {},
          edges: {},
        },
        runState: {
          runId: request.runId,
          workflowDefinitionId: UUID,
          projectId: UUID,
          workflowVersion: '1.0.0',
          graphDigest: 'a'.repeat(64),
          status: 'ready',
          admission: {
            allowed: true,
            reasonCode: 'workflow_admitted',
            evidenceRefs: ['workflow:admission'],
          },
          reasonCode: 'workflow_started',
          evidenceRefs: ['workflow:start'],
          activeNodeIds: [],
          activatedEdgeIds: [],
          readyNodeIds: [],
          waitingNodeIds: [],
          blockedNodeIds: [],
          completedNodeIds: [],
          checkpointState: 'idle',
          triggerContext: request.triggerContext,
          nodeStates: {},
          dispatchLineage: [],
          startedAt: NOW,
          updatedAt: NOW,
        },
      }) as any,
    resume: async () => {
      throw new Error('not used');
    },
    pause: async () => {
      throw new Error('not used');
    },
    completeNode: async () => {
      throw new Error('not used');
    },
    executeReadyNode: async () => {
      throw new Error('not used');
    },
    continueNode: async () => {
      throw new Error('not used');
    },
    getState: async () => null,
    ...overrides,
  };
}

describe('IngressDispatchAdmission', () => {
  it('returns accepted_already_dispatched for duplicate claims', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 'dup-source' });
    const claim = await store.claim(envelope);
    expect(claim.status).toBe('claimed');
    if (claim.status !== 'claimed') {
      return;
    }

    await store.commitDispatch(claim.reservation_id, 'dispatch-1', 'evidence-1');

    const admission = new IngressDispatchAdmission({
      opctl: null,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine: createWorkflowEngine(),
    });

    const result = await admission.admit(envelope, {
      status: 'duplicate',
      run_id: claim.run_id,
      dispatch_ref: 'dispatch-1',
      evidence_ref: 'evidence-1',
    });

    expect(result.outcome).toBe('accepted_already_dispatched');
    if (result.outcome === 'accepted_already_dispatched') {
      expect(result.run_id).toBe(claim.run_id);
    }
  });

  it('returns control_state_blocked when opctl is unavailable', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 'missing-opctl' });
    const claim = await store.claim(envelope);
    expect(claim.status).toBe('claimed');
    if (claim.status !== 'claimed') {
      return;
    }

    const admission = new IngressDispatchAdmission({
      opctl: null,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine: createWorkflowEngine(),
    });

    const result = await admission.admit(envelope, claim);
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('control_state_blocked');
      expect(result.reason_code).toBe('opctl_unavailable');
    }
  });

  it('returns control_state_blocked when the project is hard stopped', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'hard_stopped',
    } as unknown as IOpctlService;
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 'hard-stopped' });
    const claim = await store.claim(envelope);
    expect(claim.status).toBe('claimed');
    if (claim.status !== 'claimed') {
      return;
    }

    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine: createWorkflowEngine(),
    });

    const result = await admission.admit(envelope, claim);
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('control_state_blocked');
      expect(result.reason_code).toBe('project_control_state_hard_stopped');
    }
  });

  it('uses the reserved run id and persists trigger provenance on accepted dispatch', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'running',
    } as unknown as IOpctlService;
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 'running' });
    const claim = await store.claim(envelope);
    expect(claim.status).toBe('claimed');
    if (claim.status !== 'claimed') {
      return;
    }

    let capturedRunId: string | undefined;
    let capturedTriggerContext: Record<string, unknown> | undefined;
    const workflowEngine = createWorkflowEngine({
      start: async (request) => {
        capturedRunId = request.runId;
        capturedTriggerContext = request.triggerContext as Record<string, unknown>;
        return createWorkflowEngine().start(request);
      },
    });

    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine,
    });

    const result = await admission.admit(envelope, claim);
    expect(result.outcome).toBe('accepted_dispatched');
    if (result.outcome === 'accepted_dispatched') {
      expect(result.run_id).toBe(claim.run_id);
      expect(capturedRunId).toBe(claim.run_id);
      expect(capturedTriggerContext?.triggerId).toBe(envelope.trigger_id);
      expect(capturedTriggerContext?.workmodeId).toBe('system:implementation');
    }
  });

  it('returns workflow_admission_blocked and releases the claim when workflow start blocks', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'running',
    } as unknown as IOpctlService;
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 'blocked' });
    const claim = await store.claim(envelope);
    expect(claim.status).toBe('claimed');
    if (claim.status !== 'claimed') {
      return;
    }

    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine: createWorkflowEngine({
        start: async () =>
          ({
            status: 'admission_blocked',
            admission: {
              allowed: false,
              reasonCode: 'workflow_definition_unavailable',
              evidenceRefs: ['definition missing'],
            },
          }) as any,
      }),
    });

    const result = await admission.admit(envelope, claim);
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('workflow_admission_blocked');
      expect(result.reason_code).toBe('workflow_definition_unavailable');
    }

    const retry = await store.claim({
      ...envelope,
      nonce: 'nonce-2',
    });
    expect(retry.status).toBe('claimed');
  });

  it('returns replay_detected for replay claims', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const admission = new IngressDispatchAdmission({
      opctl: null,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine: createWorkflowEngine(),
    });

    const result = await admission.admit(makeEnvelope({}), { status: 'replay' });
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('replay_detected');
    }
  });
});
