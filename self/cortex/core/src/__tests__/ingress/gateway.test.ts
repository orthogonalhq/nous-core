/**
 * Callable ingress gateway behavior tests.
 */
import { describe, expect, it, vi } from 'vitest';
import { IngressGateway } from '../../ingress/gateway.js';
import type {
  IIngressAuthnVerifier,
  IIngressAuthzEvaluator,
  IIngressDispatchAdmission,
  IIngressIdempotencyStore,
  IIngressTriggerValidator,
  IngressTriggerEnvelope,
} from '@nous/shared';

const NOW = new Date().toISOString();
const ENVELOPE: IngressTriggerEnvelope = {
  trigger_id: '550e8400-e29b-41d4-a716-446655440101',
  trigger_type: 'scheduler',
  source_id: 'scheduler://daily',
  project_id: '550e8400-e29b-41d4-a716-446655440102' as import('@nous/shared').ProjectId,
  workflow_ref: 'workflow:test',
  workmode_id: 'system:implementation',
  event_name: 'schedule.tick',
  payload_ref: `sha256:${'a'.repeat(64)}`,
  idempotency_key: 'daily-1',
  nonce: 'nonce-1',
  occurred_at: NOW,
  received_at: NOW,
  auth_context_ref: null,
  trace_parent: null,
  requested_delivery_mode: 'none',
};

describe('IngressGateway', () => {
  it('submits envelopes through validation, authn, authz, claim, and admission', async () => {
    const validator: IIngressTriggerValidator = {
      validate: vi.fn(() => ({ valid: true, envelope: ENVELOPE })),
    };
    const authnVerifier: IIngressAuthnVerifier = {
      verify: vi.fn(async () => ({
        authenticated: true,
        auth_context_ref: 'internal:scheduler',
      })),
    };
    const authzEvaluator: IIngressAuthzEvaluator = {
      evaluate: vi.fn(async () => ({ allowed: true })),
    };
    const idempotencyStore: IIngressIdempotencyStore = {
      claim: vi.fn(async () => ({
        status: 'claimed',
        reservation_id: 'reservation-1',
        run_id: '550e8400-e29b-41d4-a716-446655440104' as any,
        recorded_at: NOW,
      })),
      commitDispatch: vi.fn(async () => undefined),
      releaseClaim: vi.fn(async () => undefined),
    };
    const dispatchAdmission: IIngressDispatchAdmission = {
      admit: vi.fn(async () => ({
        outcome: 'accepted_dispatched',
        run_id: '550e8400-e29b-41d4-a716-446655440104' as any,
        dispatch_ref: 'dispatch:run',
        workflow_ref: ENVELOPE.workflow_ref,
        policy_ref: 'policy:workflow',
        evidence_ref: 'evidence:run',
      })),
    };

    const gateway = new IngressGateway({
      validator,
      authnVerifier,
      authzEvaluator,
      idempotencyStore,
      dispatchAdmission,
    });

    const outcome = await gateway.submit(ENVELOPE);
    expect(outcome.outcome).toBe('accepted_dispatched');
    expect(validator.validate).toHaveBeenCalledWith(ENVELOPE);
    expect(authnVerifier.verify).toHaveBeenCalled();
    expect(authzEvaluator.evaluate).toHaveBeenCalled();
    expect(idempotencyStore.claim).toHaveBeenCalled();
    expect(dispatchAdmission.admit).toHaveBeenCalled();
  });

  it('returns rejected when authz blocks the envelope', async () => {
    const gateway = new IngressGateway({
      validator: {
        validate: () => ({ valid: true, envelope: ENVELOPE }),
      },
      authnVerifier: {
        verify: async () => ({
          authenticated: true,
          auth_context_ref: 'internal:scheduler',
        }),
      },
      authzEvaluator: {
        evaluate: async () => ({ allowed: false, reason: 'policy_blocked' }),
      },
      idempotencyStore: {
        claim: async () => ({
          status: 'claimed',
          reservation_id: 'reservation-1',
          run_id: '550e8400-e29b-41d4-a716-446655440104' as any,
          recorded_at: NOW,
        }),
        commitDispatch: async () => undefined,
        releaseClaim: async () => undefined,
      },
      dispatchAdmission: {
        admit: async () => {
          throw new Error('should not be called');
        },
      },
    });

    const outcome = await gateway.submit(ENVELOPE);
    expect(outcome.outcome).toBe('rejected');
    if (outcome.outcome === 'rejected') {
      expect(outcome.reason).toBe('policy_blocked');
    }
  });
});
