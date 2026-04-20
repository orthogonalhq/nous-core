import { describe, expect, it } from 'vitest';
import {
  AgentClassSchema,
  AgentInputSchema,
  AgentResultSchema,
  DispatchIntentSchema,
  DispatchOrchestratorRequestSchema,
  DispatchWorkerRequestSchema,
  EMPTY_RESPONSE_MARKER,
  EmptyResponseKindSchema,
  NARRATE_WITHOUT_DISPATCH_MARKER,
  GatewayInboxMessageSchema,
  GatewayOutboxEventSchema,
  GatewayStampedPacketSchema,
} from '../../types/agent-gateway.js';

const GATEWAY_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
const TRACE_ID = '550e8400-e29b-41d4-a716-446655440003';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440004';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440005';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440006';
const NOW = new Date().toISOString();

function createStampedPacket() {
  return {
    nous: { v: 3 },
    route: {
      emitter: { id: 'internal-mcp::worker::node-test::task-complete' },
      target: { id: 'internal-mcp::parent::run-test::receive-task-complete' },
    },
    envelope: {
      direction: 'internal' as const,
      type: 'response_packet' as const,
    },
    correlation: {
      handoff_id: 'handoff-1',
      correlation_id: RUN_ID,
      cycle: 'n/a',
      emitted_at_utc: NOW,
      emitted_at_unix_ms: '1773342000000',
      sequence_in_run: '1',
      emitted_at_unix_us: '1773342000000000',
    },
    payload: {
      schema: 'n/a',
      artifact_type: 'n/a',
      data: { done: true },
    },
    retry: {
      policy: 'value-proportional' as const,
      depth: 'lightweight' as const,
      importance_tier: 'standard' as const,
      expected_quality_gain: 'n/a',
      estimated_tokens: 'n/a',
      estimated_compute_minutes: 'n/a',
      token_price_ref: 'runtime:gateway',
      compute_price_ref: 'runtime:gateway',
      decision: 'accept' as const,
      decision_log_ref: 'runtime:gateway/task-complete',
      benchmark_tier: 'n/a' as const,
      self_repair: {
        required_on_fail_close: true as const,
        orchestration_state: 'deferred' as const,
        approval_role: 'Cortex:System',
        implementation_mode: 'direct' as const,
        plan_ref: 'runtime:gateway/self-repair',
      },
    },
  };
}

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
      v3Packet: createStampedPacket(),
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
    const suspended = AgentResultSchema.safeParse({
      status: 'suspended',
      reason: 'Lane lease held.',
      resumeWhen: 'lease_release',
      detail: {
        laneKey: 'provider:test',
      },
      correlation: {
        runId: RUN_ID,
        parentId: GATEWAY_ID,
        sequence: 4,
      },
      usage: {
        turnsUsed: 1,
        tokensUsed: 10,
        elapsedMs: 80,
        spawnUnitsUsed: 0,
      },
      evidenceRefs: [],
    });

    expect(completed.success).toBe(true);
    expect(escalated.success).toBe(true);
    expect(aborted.success).toBe(true);
    expect(exhausted.success).toBe(true);
    expect(errored.success).toBe(true);
    expect(suspended.success).toBe(true);
  });

  it('rejects undeclared extra fields on strict results', () => {
    const result = AgentResultSchema.safeParse({
      status: 'completed',
      output: { summary: 'done' },
      v3Packet: createStampedPacket(),
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
      v3Packet: createStampedPacket(),
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

describe('GatewayStampedPacketSchema — emitter_agent_class', () => {
  it('accepts packet with valid emitter_agent_class', () => {
    const packet = { ...createStampedPacket(), emitter_agent_class: 'Worker' };
    const result = GatewayStampedPacketSchema.safeParse(packet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emitter_agent_class).toBe('Worker');
    }
  });

  it('accepts packet without emitter_agent_class (backward compat)', () => {
    const packet = createStampedPacket();
    const result = GatewayStampedPacketSchema.safeParse(packet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emitter_agent_class).toBeUndefined();
    }
  });

  it('rejects packet with invalid emitter_agent_class', () => {
    const packet = { ...createStampedPacket(), emitter_agent_class: 'InvalidClass' };
    const result = GatewayStampedPacketSchema.safeParse(packet);
    expect(result.success).toBe(false);
  });

  it('accepts all valid AgentClass values as emitter_agent_class', () => {
    for (const agentClass of ['Cortex::Principal', 'Cortex::System', 'Orchestrator', 'Worker']) {
      const packet = { ...createStampedPacket(), emitter_agent_class: agentClass };
      const result = GatewayStampedPacketSchema.safeParse(packet);
      expect(result.success).toBe(true);
    }
  });
});

describe('DispatchIntentSchema', () => {
  it('accepts valid workflow intent', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'workflow',
      workflowDefinitionId: 'wf-001',
      config: { key: 'value' },
      triggerContext: 'manual',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid task intent', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'task',
      taskDefinitionId: 'task-001',
      trigger: { type: 'manual', context: { source: 'test' } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts task intent with minimal fields', () => {
    const result = DispatchIntentSchema.safeParse({ type: 'task' });
    expect(result.success).toBe(true);
  });

  it('accepts valid skill intent', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'skill',
      skillRef: 'engineer-workflow-sop',
      context: { phase: '1.1' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid autonomous intent', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'autonomous',
      objective: 'Analyze project health',
      constraints: { maxDuration: 300 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type value', () => {
    const result = DispatchIntentSchema.safeParse({ type: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required workflowDefinitionId for workflow type', () => {
    const result = DispatchIntentSchema.safeParse({ type: 'workflow' });
    expect(result.success).toBe(false);
  });

  it('rejects empty workflowDefinitionId', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'workflow',
      workflowDefinitionId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing skillRef for skill type', () => {
    const result = DispatchIntentSchema.safeParse({ type: 'skill' });
    expect(result.success).toBe(false);
  });

  it('rejects empty objective for autonomous type', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'autonomous',
      objective: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields on strict variants', () => {
    const result = DispatchIntentSchema.safeParse({
      type: 'workflow',
      workflowDefinitionId: 'wf-001',
      extraField: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});

describe('DispatchOrchestratorRequestSchema', () => {
  it('accepts valid request with all fields', () => {
    const result = DispatchOrchestratorRequestSchema.safeParse({
      dispatchIntent: { type: 'task' },
      taskInstructions: 'Execute the workflow',
      budget: { maxTurns: 10 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing dispatchIntent', () => {
    const result = DispatchOrchestratorRequestSchema.safeParse({
      taskInstructions: 'Execute the workflow',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing taskInstructions', () => {
    const result = DispatchOrchestratorRequestSchema.safeParse({
      dispatchIntent: { type: 'task' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty taskInstructions', () => {
    const result = DispatchOrchestratorRequestSchema.safeParse({
      dispatchIntent: { type: 'task' },
      taskInstructions: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts without optional budget', () => {
    const result = DispatchOrchestratorRequestSchema.safeParse({
      dispatchIntent: { type: 'task' },
      taskInstructions: 'Do work',
    });
    expect(result.success).toBe(true);
  });

  it('rejects extra fields (strict)', () => {
    const result = DispatchOrchestratorRequestSchema.safeParse({
      dispatchIntent: { type: 'task' },
      taskInstructions: 'Do work',
      targetClass: 'Orchestrator',
    });
    expect(result.success).toBe(false);
  });
});

describe('EMPTY_RESPONSE_MARKER (SP 1.15 RC-1)', () => {
  it('pins the literal marker text — drift-detector for the user-visible string', () => {
    // If this test fails, the constant text changed. Update consumers via the
    // import (single source of truth); never edit the importers directly.
    expect(EMPTY_RESPONSE_MARKER).toBe(
      '[I produced reasoning but did not finalize a response. Click Thinking to view what I was working on, or rephrase your request.]',
    );
  });
});

describe('EmptyResponseKindSchema (SP 1.15 RC-1 + SP 1.16 RC-β.1)', () => {
  it('accepts all three discriminator branches', () => {
    expect(EmptyResponseKindSchema.safeParse('thinking_only_no_finalizer').success).toBe(true);
    expect(EmptyResponseKindSchema.safeParse('no_output_at_all').success).toBe(true);
    expect(EmptyResponseKindSchema.safeParse('narrate_without_dispatch').success).toBe(true);
  });

  it('rejects any other string', () => {
    expect(EmptyResponseKindSchema.safeParse('').success).toBe(false);
    expect(EmptyResponseKindSchema.safeParse('thinking_only').success).toBe(false);
    expect(EmptyResponseKindSchema.safeParse('partial_finalizer').success).toBe(false);
    expect(EmptyResponseKindSchema.safeParse('arbitrary_value').success).toBe(false);
    expect(EmptyResponseKindSchema.safeParse(null).success).toBe(false);
    expect(EmptyResponseKindSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('NARRATE_WITHOUT_DISPATCH_MARKER (SP 1.16 RC-β.1)', () => {
  it('pins the literal marker text — drift-detector for the user-visible string', () => {
    expect(NARRATE_WITHOUT_DISPATCH_MARKER).toBe(
      '[I described an action without actually performing it. The tool I should have called was not dispatched. Please rephrase your request or try again.]',
    );
  });
});

describe('Cross-package UI literal-union consistency (SP 1.16 RC-β.1)', () => {
  // The UI layer (self/ui/src/panels/chat/types.ts) duplicates the
  // EmptyResponseKindSchema literal-union per the existing chat-types
  // convention (no @nous/shared import in UI types). This test pins the
  // expected UI shape against the shared schema so future drift fails fast.
  const UI_LITERAL_UNION_VALUES = [
    'thinking_only_no_finalizer',
    'no_output_at_all',
    'narrate_without_dispatch',
  ] as const;

  it('every shared EmptyResponseKindSchema value appears in the UI literal-union', () => {
    const sharedValues = EmptyResponseKindSchema.options;
    for (const value of sharedValues) {
      expect(UI_LITERAL_UNION_VALUES).toContain(value);
    }
  });

  it('UI literal-union has no extra values beyond the shared schema', () => {
    const sharedValues = EmptyResponseKindSchema.options as readonly string[];
    for (const uiValue of UI_LITERAL_UNION_VALUES) {
      expect(sharedValues).toContain(uiValue);
    }
  });
});

describe('DispatchWorkerRequestSchema', () => {
  it('accepts valid request with all fields', () => {
    const result = DispatchWorkerRequestSchema.safeParse({
      taskInstructions: 'Execute the task',
      nodeDefinitionId: NODE_ID,
      payload: { data: 'test' },
      budget: { maxTurns: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing taskInstructions', () => {
    const result = DispatchWorkerRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts without optional nodeDefinitionId', () => {
    const result = DispatchWorkerRequestSchema.safeParse({
      taskInstructions: 'Do work',
    });
    expect(result.success).toBe(true);
  });

  it('accepts without optional payload', () => {
    const result = DispatchWorkerRequestSchema.safeParse({
      taskInstructions: 'Do work',
    });
    expect(result.success).toBe(true);
  });

  it('accepts without optional budget', () => {
    const result = DispatchWorkerRequestSchema.safeParse({
      taskInstructions: 'Do work',
    });
    expect(result.success).toBe(true);
  });

  it('rejects extra fields (strict)', () => {
    const result = DispatchWorkerRequestSchema.safeParse({
      taskInstructions: 'Do work',
      targetClass: 'Worker',
    });
    expect(result.success).toBe(false);
  });
});
