/**
 * Ingress pipeline integration tests.
 */
import { describe, expect, it } from 'vitest';
import {
  IngressAuthnVerifier,
  IngressAuthzEvaluator,
  IngressDispatchAdmission,
  IngressGateway,
  InMemoryIngressIdempotencyStore,
  IngressTriggerValidator,
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
  name: 'Ingress Integration Project',
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
    update: async () => undefined,
    archive: async () => undefined,
  };
}

function createWorkflowEngine(blocked = false): IWorkflowEngine {
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
      blocked
        ? ({
            status: 'admission_blocked',
            admission: {
              allowed: false,
              reasonCode: 'workflow_definition_unavailable',
              evidenceRefs: ['definition missing'],
            },
          }) as any
        : ({
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
  };
}

function createGateway(options?: { blocked?: boolean }) {
  const validator = new IngressTriggerValidator();
  const authnVerifier = new IngressAuthnVerifier();
  const authzEvaluator = new IngressAuthzEvaluator();
  const idempotencyStore = new InMemoryIngressIdempotencyStore();
  const opctl: IOpctlService = {
    getProjectControlState: async () => 'running',
  } as unknown as IOpctlService;
  const dispatchAdmission = new IngressDispatchAdmission({
    opctl,
    idempotencyStore,
    projectStore: createProjectStore(),
    workflowEngine: createWorkflowEngine(options?.blocked),
  });

  return new IngressGateway({
    validator,
    authnVerifier,
    authzEvaluator,
    idempotencyStore,
    dispatchAdmission,
  });
}

describe('Ingress pipeline integration', () => {
  it('accepts a valid scheduler trigger through the canonical gateway path', async () => {
    const gateway = createGateway();
    const outcome = await gateway.submit(makeEnvelope({}));
    expect(outcome.outcome).toBe('accepted_dispatched');
    if (outcome.outcome === 'accepted_dispatched') {
      expect(outcome.run_id).toBeDefined();
      expect(outcome.evidence_ref).toBeDefined();
    }
  });

  it('returns accepted_already_dispatched for a duplicate trigger', async () => {
    const gateway = createGateway();
    const envelope = makeEnvelope({ source_id: 's1', idempotency_key: 'k1' });
    const firstOutcome = await gateway.submit(envelope);
    expect(firstOutcome.outcome).toBe('accepted_dispatched');
    const runId = firstOutcome.outcome === 'accepted_dispatched'
      ? firstOutcome.run_id
      : null;

    const secondOutcome = await gateway.submit(envelope);
    expect(secondOutcome.outcome).toBe('accepted_already_dispatched');
    if (secondOutcome.outcome === 'accepted_already_dispatched') {
      expect(secondOutcome.run_id).toBe(runId);
    }
  });

  it('returns workflow_admission_blocked with a preserved reason_code', async () => {
    const gateway = createGateway({ blocked: true });
    const outcome = await gateway.submit(makeEnvelope({ source_id: 'blocked' }));
    expect(outcome.outcome).toBe('rejected');
    if (outcome.outcome === 'rejected') {
      expect(outcome.reason).toBe('workflow_admission_blocked');
      expect(outcome.reason_code).toBe('workflow_definition_unavailable');
    }
  });
});
