import type { TraceEvidenceReference } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { AcceptanceRouter } from '../acceptance-router.js';

const NOW = '2026-03-10T00:00:00.000Z';
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
} as unknown as TraceEvidenceReference;

describe('AcceptanceRouter', () => {
  it('routes marketplace packages into runtime authorization intent', async () => {
    const router = new AcceptanceRouter();

    const result = await router.route({
      candidate_id: 'candidate-1',
      decision_id: 'decision-1',
      source_type: 'marketplace_package',
      source_ref: 'pkg.persona-engine',
      accepted_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(result.route).toBe('runtime_authorization_required');
    expect(result.lifecycle_request_ref).toContain('lifecycle-intent:pkg.persona-engine');
  });

  it('keeps non-package sources advisory-only', async () => {
    const router = new AcceptanceRouter();

    const workflow = await router.route({
      candidate_id: 'candidate-2',
      decision_id: 'decision-2',
      source_type: 'workflow_template',
      source_ref: 'template.deploy',
      accepted_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });
    const tip = await router.route({
      candidate_id: 'candidate-3',
      decision_id: 'decision-3',
      source_type: 'runtime_tip',
      source_ref: 'tip:avoid-manual-step',
      accepted_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(workflow.route).toBe('workflow_template_draft');
    expect(tip.route).toBe('advisory_acknowledged');
    expect(workflow.lifecycle_request_ref).toBeUndefined();
    expect(tip.lifecycle_request_ref).toBeUndefined();
  });
});
