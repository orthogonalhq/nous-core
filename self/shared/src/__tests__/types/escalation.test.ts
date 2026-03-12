import { describe, expect, it } from 'vitest';
import {
  AcknowledgeInAppEscalationInputSchema,
  EscalationAcknowledgementSurfaceSchema,
  InAppEscalationAcknowledgementSchema,
  InAppEscalationRecordSchema,
  ProjectEscalationQueueSnapshotSchema,
} from '../../types/escalation.js';

const ESCALATION_ID = '550e8400-e29b-41d4-a716-446655440210';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440211';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440212';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440213';
const TRACE_ID = '550e8400-e29b-41d4-a716-446655440214';
const NOW = '2026-03-09T00:00:00.000Z';

describe('InAppEscalationAcknowledgementSchema', () => {
  it('parses canonical acknowledgement records', () => {
    const result = InAppEscalationAcknowledgementSchema.safeParse({
      surface: 'projects',
      actorType: 'principal',
      acknowledgedAt: NOW,
      note: 'Investigating',
      evidenceRefs: ['evidence:escalation:ack'],
    });

    expect(result.success).toBe(true);
  });
});

describe('InAppEscalationRecordSchema', () => {
  it('parses in-app escalation queue records', () => {
    const result = InAppEscalationRecordSchema.safeParse({
      escalationId: ESCALATION_ID,
      projectId: PROJECT_ID,
      source: 'workflow',
      severity: 'high',
      title: 'Workflow blocked on review',
      message: 'A workflow review gate requires attention.',
      status: 'visible',
      routeTargets: ['projects', 'chat'],
      requiredAction: 'Review and resume',
      workflowRunId: RUN_ID,
      nodeDefinitionId: NODE_ID,
      traceId: TRACE_ID,
      controlState: 'paused_review',
      evidenceRefs: ['evidence:workflow:blocked'],
      acknowledgements: [],
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });

  it('accepts mobile as a routed in-app escalation surface', () => {
    const result = InAppEscalationRecordSchema.safeParse({
      escalationId: ESCALATION_ID,
      projectId: PROJECT_ID,
      source: 'workflow',
      severity: 'critical',
      title: 'Mobile escalation required',
      message: 'A critical escalation is visible on mobile.',
      status: 'visible',
      routeTargets: ['projects', 'chat', 'mobile'],
      acknowledgements: [],
      evidenceRefs: [],
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('ProjectEscalationQueueSnapshotSchema', () => {
  it('summarizes queue counts with project scoping', () => {
    const result = ProjectEscalationQueueSnapshotSchema.safeParse({
      projectId: PROJECT_ID,
      items: [],
      openCount: 2,
      acknowledgedCount: 1,
      urgentCount: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe('AcknowledgeInAppEscalationInputSchema', () => {
  it('requires supported surface and actor identity', () => {
    const result = AcknowledgeInAppEscalationInputSchema.safeParse({
      escalationId: ESCALATION_ID,
      surface: 'chat',
      actorType: 'principal',
      note: 'Handled from chat',
    });

    expect(result.success).toBe(true);
  });
});

describe('EscalationAcknowledgementSurfaceSchema', () => {
  it('allows communication-gateway acknowledgements as a canonical origin', () => {
    const result = EscalationAcknowledgementSurfaceSchema.safeParse(
      'communication_gateway',
    );

    expect(result.success).toBe(true);
  });

  it('allows mobile acknowledgements as a canonical origin', () => {
    const result = EscalationAcknowledgementSurfaceSchema.safeParse('mobile');

    expect(result.success).toBe(true);
  });
});
