/**
 * Phase 5.3 ingress adversarial tests carried forward under Phase 9.3 ingress semantics.
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

const UUID = '550e8400-e29b-41d4-a716-446655440100';
const NOW = new Date().toISOString();

const projectConfig = {
  id: UUID,
  name: 'Ingress Adversarial Project',
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

function createWorkflowEngine(): IWorkflowEngine {
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
  };
}

function createGateway(store = new InMemoryIngressIdempotencyStore()) {
  const opctl: IOpctlService = {
    getProjectControlState: async () => 'running',
  } as unknown as IOpctlService;
  return new IngressGateway({
    validator: new IngressTriggerValidator(),
    authnVerifier: new IngressAuthnVerifier(),
    authzEvaluator: new IngressAuthzEvaluator(),
    idempotencyStore: store,
    dispatchAdmission: new IngressDispatchAdmission({
      opctl,
      idempotencyStore: store,
      projectStore: createProjectStore(),
      workflowEngine: createWorkflowEngine(),
    }),
  });
}

describe('Phase 5.3 ingress adversarial', () => {
  describe('0 successful replay attacks', () => {
    it('rejects replay with a stale timestamp', async () => {
      const store = new InMemoryIngressIdempotencyStore({
        replayWindowMs: 60 * 1000,
      });
      const staleDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = await store.claim(
        makeEnvelope({
          occurred_at: staleDate,
          received_at: staleDate,
          nonce: 'unique-replay-1',
        }),
      );
      expect(result.status).toBe('replay');
    });

    it('rejects replay with a duplicate nonce within the same source', async () => {
      const store = new InMemoryIngressIdempotencyStore();
      const first = await store.claim(
        makeEnvelope({
          source_id: 'attacker',
          idempotency_key: 'k1',
          nonce: 'reused-nonce',
        }),
      );
      expect(first.status).toBe('claimed');

      const second = await store.claim(
        makeEnvelope({
          source_id: 'attacker',
          idempotency_key: 'k2',
          nonce: 'reused-nonce',
        }),
      );
      expect(second.status).toBe('replay');
    });

    it('returns the original run for reordered duplicate delivery', async () => {
      const gateway = createGateway();
      const first = await gateway.submit(
        makeEnvelope({
          source_id: 's1',
          idempotency_key: 'same-key',
          nonce: 'n1',
        }),
      );
      expect(first.outcome).toBe('accepted_dispatched');

      const second = await gateway.submit(
        makeEnvelope({
          source_id: 's1',
          idempotency_key: 'same-key',
          nonce: 'n2',
        }),
      );
      expect(second.outcome).toBe('accepted_already_dispatched');
      if (
        first.outcome === 'accepted_dispatched' &&
        second.outcome === 'accepted_already_dispatched'
      ) {
        expect(second.run_id).toBe(first.run_id);
      }
    });
  });

  describe('100% duplicate idempotent', () => {
    it('same source_id+idempotency_key never creates a second run', async () => {
      const gateway = createGateway();
      const envelope = makeEnvelope({
        source_id: 'dup-source',
        idempotency_key: 'dup-key',
        nonce: 'n1',
      });

      const first = await gateway.submit(envelope);
      expect(first.outcome).toBe('accepted_dispatched');

      const second = await gateway.submit(envelope);
      expect(second.outcome).toBe('accepted_already_dispatched');
      if (
        first.outcome === 'accepted_dispatched' &&
        second.outcome === 'accepted_already_dispatched'
      ) {
        expect(second.run_id).toBe(first.run_id);
      }
    });
  });
});
