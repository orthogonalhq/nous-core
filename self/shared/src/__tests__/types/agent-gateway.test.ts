import { describe, expect, it } from 'vitest';
import {
  AgentClassSchema,
  AgentInputSchema,
  AgentResultSchema,
  GatewayInboxMessageSchema,
  GatewayOutboxEventSchema,
} from '../../types/agent-gateway.js';

const GATEWAY_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TRACE_ID = '550e8400-e29b-41d4-a716-446655440003';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440004';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440005';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440006';
const NOW = new Date().toISOString();

describe('AgentClassSchema', () => {
  it('accepts all canonical agent classes', () => {
    expect(AgentClassSchema.safeParse('Cortex::Principal').success).toBe(true);
    expect(AgentClassSchema.safeParse('Cortex::System').success).toBe(true);
    expect(AgentClassSchema.safeParse('Orchestrator').success).toBe(true);
    expect(AgentClassSchema.safeParse('Worker').success).toBe(true);
  });
});

describe('AgentInputSchema', () => {
  it('parses a valid agent input', () => {
    const result = AgentInputSchema.safeParse({
      taskInstructions: 'Review the payload and complete the task.',
      payload: { artifact: 'phase-12.1' },
      budget: {
        maxTurns: 4,
        maxTokens: 4000,
        timeoutMs: 15000,
      },
      spawnBudgetCeiling: 12,
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 0,
      },
      execution: {
        projectId: PROJECT_ID,
        executionId: EXECUTION_ID,
        nodeDefinitionId: NODE_ID,
        traceId: TRACE_ID,
        workmodeId: 'system:implementation',
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('GatewayInboxMessageSchema', () => {
  it('parses abort messages', () => {
    const result = GatewayInboxMessageSchema.safeParse({
      type: 'abort',
      messageId: MESSAGE_ID,
      reason: 'Supervisor requested shutdown.',
      createdAt: NOW,
    });

    expect(result.success).toBe(true);
  });

  it('parses inject_context messages', () => {
    const result = GatewayInboxMessageSchema.safeParse({
      type: 'inject_context',
      messageId: MESSAGE_ID,
      createdAt: NOW,
      frames: [
        {
          role: 'system',
          source: 'inbox',
          content: 'Use the newer input constraints.',
          createdAt: NOW,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('GatewayOutboxEventSchema', () => {
  it('parses turn acknowledgements', () => {
    const result = GatewayOutboxEventSchema.safeParse({
      type: 'turn_ack',
      eventId: MESSAGE_ID,
      turn: 1,
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 2,
      },
      usage: {
        turnsUsed: 0,
        tokensUsed: 12,
        elapsedMs: 45,
        spawnUnitsUsed: 0,
      },
      emittedAt: NOW,
    });

    expect(result.success).toBe(true);
  });

  it('parses observation events', () => {
    const result = GatewayOutboxEventSchema.safeParse({
      type: 'observation',
      eventId: MESSAGE_ID,
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 3,
      },
      usage: {
        turnsUsed: 1,
        tokensUsed: 14,
        elapsedMs: 60,
        spawnUnitsUsed: 0,
      },
      observation: {
        observationType: 'progress_update',
        content: 'Child agent completed the analysis.',
        detail: {
          child_status: 'completed',
        },
      },
      emittedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('AgentResultSchema', () => {
  it('parses valid result variants', () => {
    const completed = AgentResultSchema.safeParse({
      status: 'completed',
      output: { summary: 'done' },
      v3Packet: {
        nous: {
          v: 3,
        },
      },
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 1,
        tokensUsed: 40,
        elapsedMs: 120,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
      artifactRefs: ['artifact-1'],
    });
    const escalated = AgentResultSchema.safeParse({
      status: 'escalated',
      reason: 'Need principal confirmation.',
      severity: 'high',
      detail: {},
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 2,
        tokensUsed: 60,
        elapsedMs: 160,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
    });
    const aborted = AgentResultSchema.safeParse({
      status: 'aborted',
      reason: 'Stopped by parent.',
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 2,
        tokensUsed: 60,
        elapsedMs: 160,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
    });
    const exhausted = AgentResultSchema.safeParse({
      status: 'budget_exhausted',
      exhausted: 'turns',
      partialState: {
        agentId: GATEWAY_ID,
        agentClass: 'Worker',
        correlation: {
          runId: RUN_ID,
          parentId: GATEWAY_ID,
          sequence: 4,
        },
        budget: {
          maxTurns: 2,
          maxTokens: 500,
          timeoutMs: 3000,
        },
        usage: {
          turnsUsed: 2,
          tokensUsed: 400,
          elapsedMs: 1200,
          spawnUnitsUsed: 0,
        },
        startedAt: NOW,
        lastUpdatedAt: NOW,
        contextFrameCount: 3,
      },
      turnsUsed: 2,
      tokensUsed: 400,
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 2,
        tokensUsed: 400,
        elapsedMs: 1200,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
    });
    const errored = AgentResultSchema.safeParse({
      status: 'error',
      reason: 'Provider unavailable.',
      detail: {},
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 1,
        tokensUsed: 80,
        elapsedMs: 180,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
    });

    expect(completed.success).toBe(true);
    expect(escalated.success).toBe(true);
    expect(aborted.success).toBe(true);
    expect(exhausted.success).toBe(true);
    expect(errored.success).toBe(true);
  });

  it('rejects undeclared extra fields on strict results', () => {
    const result = AgentResultSchema.safeParse({
      status: 'completed',
      output: { summary: 'done' },
      v3Packet: {
        nous: {
          v: 3,
        },
      },
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 1,
        tokensUsed: 40,
        elapsedMs: 120,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejects transcript leakage fields on results', () => {
    const result = AgentResultSchema.safeParse({
      status: 'completed',
      output: { summary: 'done' },
      v3Packet: {
        nous: {
          v: 3,
        },
      },
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 1,
        tokensUsed: 40,
        elapsedMs: 120,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
      context: [
        {
          role: 'assistant',
          content: 'raw transcript should not be here',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
