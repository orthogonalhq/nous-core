import type { ProjectId, TraceEvidenceReference } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DocumentNudgeStore } from '../document-nudge-store.js';
import { SuppressionEngine } from '../suppression-engine.js';
import { SuppressionStore } from '../suppression-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-10T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440301' as ProjectId;
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
} as unknown as TraceEvidenceReference;

async function createEngine(now = NOW) {
  const documentStore = new DocumentNudgeStore(createMemoryDocumentStore());
  const suppressionStore = new SuppressionStore(documentStore);
  const engine = new SuppressionEngine({
    suppressionStore,
    now: () => now,
  });

  return { suppressionStore, engine };
}

describe('SuppressionEngine', () => {
  it('enforces candidate, project, and global suppressions across surfaces', async () => {
    const { suppressionStore, engine } = await createEngine();

    await suppressionStore.save({
      suppression_id: '550e8400-e29b-41d4-a716-446655440201',
      action: 'dismiss_once',
      scope: 'candidate',
      target_ref: 'candidate-1',
      surface_set: [],
      reason_codes: ['NDG-SUPPRESSION-DISMISS-ONCE'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });
    await suppressionStore.save({
      suppression_id: '550e8400-e29b-41d4-a716-446655440202',
      action: 'mute_project',
      scope: 'project',
      target_ref: PROJECT_ID,
      surface_set: ['cli_suggestion'],
      reason_codes: ['NDG-SUPPRESSION-MUTED-PROJECT'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });
    await suppressionStore.save({
      suppression_id: '550e8400-e29b-41d4-a716-446655440203',
      action: 'mute_global',
      scope: 'global',
      target_ref: 'global',
      surface_set: ['communication_gateway'],
      reason_codes: ['NDG-SUPPRESSION-MUTED-GLOBAL'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });

    const candidateBlocked = await engine.evaluate({
      candidate: {
        candidate_id: 'candidate-1',
        source_type: 'runtime_tip',
        source_ref: 'tip:1',
        origin_trust_tier: 'nous_first_party',
        compatibility_state: 'compatible',
        target_scope: 'project',
        reason_codes: [],
        created_at: NOW,
      },
      surface: 'discovery_card',
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });
    const projectBlocked = await engine.evaluate({
      candidate: {
        candidate_id: 'candidate-2',
        source_type: 'runtime_tip',
        source_ref: 'tip:2',
        origin_trust_tier: 'nous_first_party',
        compatibility_state: 'compatible',
        target_scope: 'project',
        reason_codes: [],
        created_at: NOW,
      },
      surface: 'cli_suggestion',
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });
    const globalBlocked = await engine.evaluate({
      candidate: {
        candidate_id: 'candidate-3',
        source_type: 'runtime_tip',
        source_ref: 'tip:3',
        origin_trust_tier: 'nous_first_party',
        compatibility_state: 'compatible',
        target_scope: 'project',
        reason_codes: [],
        created_at: NOW,
      },
      surface: 'communication_gateway',
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(candidateBlocked.reason_codes).toContain('NDG-SUPPRESSION-DISMISS-ONCE');
    expect(projectBlocked.reason_codes).toContain('NDG-SUPPRESSION-MUTED-PROJECT');
    expect(globalBlocked.reason_codes).toContain('NDG-SUPPRESSION-MUTED-GLOBAL');
  });

  it('ignores expired snoozes and limits dismiss_once to one candidate', async () => {
    const { suppressionStore, engine } = await createEngine('2026-03-11T00:00:00.000Z');

    await suppressionStore.save({
      suppression_id: '550e8400-e29b-41d4-a716-446655440204',
      action: 'snooze',
      scope: 'candidate',
      target_ref: 'candidate-1',
      surface_set: ['discovery_card'],
      reason_codes: ['NDG-SUPPRESSION-SNOOZE-ACTIVE'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
      expires_at: '2026-03-10T12:00:00.000Z',
    });
    await suppressionStore.save({
      suppression_id: '550e8400-e29b-41d4-a716-446655440205',
      action: 'dismiss_once',
      scope: 'candidate',
      target_ref: 'candidate-1',
      surface_set: [],
      reason_codes: ['NDG-SUPPRESSION-DISMISS-ONCE'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });

    const active = await engine.evaluate({
      candidate: {
        candidate_id: 'candidate-1',
        source_type: 'runtime_tip',
        source_ref: 'tip:1',
        origin_trust_tier: 'nous_first_party',
        compatibility_state: 'compatible',
        target_scope: 'project',
        reason_codes: [],
        created_at: NOW,
      },
      surface: 'discovery_card',
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });
    const otherCandidate = await engine.evaluate({
      candidate: {
        candidate_id: 'candidate-2',
        source_type: 'runtime_tip',
        source_ref: 'tip:2',
        origin_trust_tier: 'nous_first_party',
        compatibility_state: 'compatible',
        target_scope: 'project',
        reason_codes: [],
        created_at: NOW,
      },
      surface: 'discovery_card',
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(active.reason_codes).toContain('NDG-SUPPRESSION-DISMISS-ONCE');
    expect(active.reason_codes).not.toContain('NDG-SUPPRESSION-SNOOZE-ACTIVE');
    expect(otherCandidate.blocked).toBe(false);
  });
});
