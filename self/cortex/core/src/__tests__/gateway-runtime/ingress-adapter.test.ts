import { describe, expect, it, vi } from 'vitest';
import { GatewayRuntimeIngressAdapter } from '../../gateway-runtime/index.js';

const ENVELOPE = {
  trigger_id: '00000000-0000-4000-8000-000000000010',
  trigger_type: 'scheduler' as const,
  source_id: 'scheduler://phase-12.3',
  project_id: '00000000-0000-4000-8000-000000000011' as never,
  workflow_ref: 'workflow://phase-12.3',
  workmode_id: 'system:implementation' as never,
  event_name: 'scheduled_run',
  payload_ref: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  idempotency_key: 'schedule:phase-12.3:1',
  nonce: 'nonce-1',
  occurred_at: '2026-03-12T20:00:00.000Z',
  received_at: '2026-03-12T20:00:00.000Z',
  auth_context_ref: null,
  trace_parent: null,
  requested_delivery_mode: 'none' as const,
};

describe('GatewayRuntimeIngressAdapter', () => {
  it('rejects malformed envelopes before forwarding to the runtime', async () => {
    const runtime = {
      submitIngressEnvelope: vi.fn(),
    };
    const adapter = new GatewayRuntimeIngressAdapter(runtime as never);

    const outcome = await adapter.submit({
      ...ENVELOPE,
      trigger_id: 'invalid',
    } as never);

    expect(outcome.outcome).toBe('rejected');
    expect(runtime.submitIngressEnvelope).not.toHaveBeenCalled();
  });

  it('deduplicates accepted ingress dispatches by source and idempotency key', async () => {
    const runtime = {
      submitIngressEnvelope: vi.fn().mockResolvedValue({
        outcome: 'accepted_dispatched',
        run_id: '00000000-0000-4000-8000-000000000012',
        dispatch_ref: 'dispatch:1',
        workflow_ref: ENVELOPE.workflow_ref,
        policy_ref: 'policy:1',
        evidence_ref: 'evidence:1',
      }),
    };
    const adapter = new GatewayRuntimeIngressAdapter(runtime as never);

    const first = await adapter.submit(ENVELOPE as never);
    const second = await adapter.submit(ENVELOPE as never);

    expect(first.outcome).toBe('accepted_dispatched');
    expect(second.outcome).toBe('accepted_already_dispatched');
    expect(runtime.submitIngressEnvelope).toHaveBeenCalledTimes(1);
  });
});
