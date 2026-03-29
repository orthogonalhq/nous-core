/**
 * Unit tests for PfcEngine.
 */
import { describe, it, expect, vi } from 'vitest';
import { PfcEngine } from '../pfc-engine.js';
import type { IConfig, IToolExecutor, IThoughtEmitter, ToolDefinition, ThoughtPfcDecisionPayload } from '@nous/shared';
import { createEvaluationInput } from './fixtures/confidence-governance-scenarios.js';

function mockConfig(pfcTier: number): IConfig {
  return {
    get: () => ({ pfcTier } as ReturnType<IConfig['get']>),
    getSection: () => ({}),
    update: async () => {},
    reload: async () => {},
  };
}

function mockToolExecutor(toolNames: string[]): IToolExecutor {
  const tools: ToolDefinition[] = toolNames.map((name) => ({
    name,
    version: '1.0.0',
    description: '',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    capabilities: [],
    permissionScope: 'project',
  }));
  return {
    execute: async () => ({ success: true, output: null, durationMs: 0 }),
    listTools: async () => tools,
  };
}

describe('PfcEngine', () => {
  it('implements IPfcEngine contract', () => {
    const pfc = new PfcEngine(
      mockConfig(3),
      mockToolExecutor(['echo']),
    );
    expect(pfc).toBeDefined();
    expect(typeof pfc.evaluateConfidenceGovernance).toBe('function');
    expect(typeof pfc.evaluateMemoryWrite).toBe('function');
    expect(typeof pfc.evaluateMemoryMutation).toBe('function');
    expect(typeof pfc.evaluateToolExecution).toBe('function');
    expect(typeof pfc.reflect).toBe('function');
    expect(typeof pfc.evaluateEscalation).toBe('function');
    expect(typeof pfc.getTier).toBe('function');
  });

  describe('evaluateConfidenceGovernance', () => {
    it('returns the runtime governance decision bundle', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));

      const decision = await pfc.evaluateConfidenceGovernance(
        createEvaluationInput({
          governance: 'may',
          actionCategory: 'model-invoke',
          confidenceSignal: {
            tier: 'high',
            confidence: 0.95,
            supportingSignals: 22,
            decayState: 'stable',
          },
        }),
      );

      expect(decision.outcome).toBe('allow_autonomy');
      expect(decision.reasonCode).toBe('CGR-ALLOW-AUTONOMY');
      expect(decision.autonomyAllowed).toBe(true);
    });

    it('emits observer metrics and structured logs for the runtime decision', async () => {
      const metrics: Array<{
        name: string;
        labels?: Record<string, string | number | boolean>;
      }> = [];
      const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), {
        metric(input) {
          metrics.push(input);
        },
        log(input) {
          logs.push(input);
        },
      });

      const decision = await pfc.evaluateConfidenceGovernance(
        createEvaluationInput({
          actionCategory: 'tool-execute',
          governance: 'may',
          confidenceSignal: {
            tier: 'high',
            confidence: 0.99,
            supportingSignals: 30,
            decayState: 'stable',
          },
        }),
      );

      expect(decision.reasonCode).toBe('CGR-DEFER-HIGH-RISK-CONFIRMATION');
      expect(
        metrics.some(
          (metric) =>
            metric.name === 'confidence_governance_decision_total' &&
            metric.labels?.reasonCode === 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
        ),
      ).toBe(true);
      expect(
        metrics.some(
          (metric) =>
            metric.name ===
              'confidence_governance_high_risk_override_total' &&
            metric.labels?.actionCategory === 'tool-execute',
        ),
      ).toBe(true);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.event).toBe('confidence_governance.runtime.decision');
      expect(logs[0]?.fields.outcome).toBe('defer');
    });
  });

  describe('evaluateMemoryWrite', () => {
    it('denies candidate with confidence < 0.5', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.3,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );
      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-CONFIDENCE-BELOW-THRESHOLD');
    });

    it('approves candidate with confidence >= 0.5', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.8,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );
      expect(decision.approved).toBe(true);
      expect(decision.reason).toBe('MEM-WRITE-APPROVED');
    });
  });

  describe('evaluateMemoryMutation', () => {
    const traceId = '00000000-0000-0000-0000-000000000001' as never;

    it('denies direct core actor mutation attempts', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'soft-delete',
        actor: 'core',
        targetEntryId: '00000000-0000-0000-0000-000000000002' as never,
        reason: 'test',
        traceId,
        evidenceRefs: [],
      });

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-ACTOR-BOUNDARY-BLOCKED');
    });

    it('denies hard-delete without principal override', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'hard-delete',
        actor: 'operator',
        targetEntryId: '00000000-0000-0000-0000-000000000003' as never,
        reason: 'cleanup',
        traceId,
        evidenceRefs: [],
      });

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-HARD-DELETE-REQUIRES-OVERRIDE');
    });

    it('approves hard-delete with principal override', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'hard-delete',
        actor: 'operator',
        targetEntryId: '00000000-0000-0000-0000-000000000004' as never,
        reason: 'legal request',
        traceId,
        principalOverride: { rationale: 'principal approved destructive erase' },
        evidenceRefs: [],
      });

      expect(decision.approved).toBe(true);
      expect(decision.reason).toBe('MEM-MUTATION-APPROVED');
    });

    it('denies create mutation when replacement candidate confidence is below threshold', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));
      const decision = await pfc.evaluateMemoryMutation({
        action: 'create',
        actor: 'pfc',
        reason: 'test',
        traceId,
        evidenceRefs: [],
        replacementCandidate: {
          content: 'candidate',
          type: 'fact',
          scope: 'project',
          confidence: 0.2,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
      });

      expect(decision.approved).toBe(false);
      expect(decision.reason).toBe('MEM-CONFIDENCE-BELOW-THRESHOLD');
    });
  });

  describe('evaluateToolExecution', () => {
    it('denies tool not in listTools', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor(['echo']),
      );
      const decision = await pfc.evaluateToolExecution('unknown_tool', {}, undefined);
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('not registered');
    });

    it('approves tool in listTools', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor(['echo']),
      );
      const decision = await pfc.evaluateToolExecution('echo', {}, undefined);
      expect(decision.approved).toBe(true);
      expect(decision.reason).toContain('passed');
    });
  });

  describe('reflect', () => {
    it('returns fixed confidence and qualityScore', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const result = await pfc.reflect('output', {
        output: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        tier: 3,
      });
      expect(result.confidence).toBe(0.8);
      expect(result.qualityScore).toBe(0.8);
      expect(result.shouldEscalate).toBe(false);
    });
  });

  describe('evaluateEscalation', () => {
    it('returns shouldEscalate true when confidence < 0.3', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateEscalation({
        trigger: 'low_confidence',
        context: 'test',
        confidence: 0.2,
      });
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.reason).toContain('low confidence');
    });

    it('returns shouldEscalate false when confidence >= 0.3', async () => {
      const pfc = new PfcEngine(
        mockConfig(3),
        mockToolExecutor([]),
      );
      const decision = await pfc.evaluateEscalation({
        trigger: 'test',
        context: 'test',
        confidence: 0.8,
      });
      expect(decision.shouldEscalate).toBe(false);
    });
  });

  describe('getTier', () => {
    it('returns config pfcTier when valid', () => {
      const pfc = new PfcEngine(
        mockConfig(4),
        mockToolExecutor([]),
      );
      expect(pfc.getTier()).toBe(4);
    });

    it('returns default 3 when pfcTier invalid', () => {
      const config = {
        get: () => ({}),
        getSection: () => ({}),
        update: async () => {},
        reload: async () => {},
      } as IConfig;
      const pfc = new PfcEngine(config, mockToolExecutor([]));
      expect(pfc.getTier()).toBe(3);
    });
  });

  describe('ThoughtEmitter integration', () => {
    function mockThoughtEmitter(): IThoughtEmitter & {
      pfcCalls: ThoughtPfcDecisionPayload[];
    } {
      const pfcCalls: ThoughtPfcDecisionPayload[] = [];
      return {
        pfcCalls,
        emitPfcDecision: vi.fn((payload: ThoughtPfcDecisionPayload) => {
          pfcCalls.push(payload);
        }),
        emitTurnLifecycle: vi.fn(),
        resetSequence: vi.fn(),
      };
    }

    it('emits confidence-governance thought when thoughtEmitter is set', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), undefined, emitter);

      await pfc.evaluateConfidenceGovernance(
        createEvaluationInput({
          governance: 'may',
          actionCategory: 'model-invoke',
          confidenceSignal: {
            tier: 'high',
            confidence: 0.95,
            supportingSignals: 22,
            decayState: 'stable',
          },
        }),
      );

      expect(emitter.emitPfcDecision).toHaveBeenCalledTimes(1);
      expect(emitter.pfcCalls[0]!.thoughtType).toBe('confidence-governance');
    });

    it('emits memory-write thought on approved write', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), undefined, emitter);

      await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.8,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );

      expect(emitter.pfcCalls[0]!.thoughtType).toBe('memory-write');
      expect(emitter.pfcCalls[0]!.decision).toBe('approved');
    });

    it('emits memory-mutation thought on denied mutation', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), undefined, emitter);

      await pfc.evaluateMemoryMutation({
        action: 'soft-delete',
        actor: 'core',
        targetEntryId: '00000000-0000-0000-0000-000000000002' as never,
        reason: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        evidenceRefs: [],
      });

      expect(emitter.pfcCalls[0]!.thoughtType).toBe('memory-mutation');
      expect(emitter.pfcCalls[0]!.decision).toBe('denied');
    });

    it('emits tool-execution thought', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor(['echo']), undefined, emitter);

      await pfc.evaluateToolExecution('echo', {}, undefined);

      expect(emitter.pfcCalls[0]!.thoughtType).toBe('tool-execution');
      expect(emitter.pfcCalls[0]!.decision).toBe('approved');
    });

    it('emits reflection thought', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), undefined, emitter);

      await pfc.reflect('output', {
        output: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        tier: 3,
      });

      expect(emitter.pfcCalls[0]!.thoughtType).toBe('reflection');
      expect(emitter.pfcCalls[0]!.decision).toBe('neutral');
      expect(emitter.pfcCalls[0]!.confidence).toBe(0.8);
    });

    it('emits escalation thought when escalating', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), undefined, emitter);

      await pfc.evaluateEscalation({
        trigger: 'low_confidence',
        context: 'test',
        confidence: 0.2,
      });

      expect(emitter.pfcCalls[0]!.thoughtType).toBe('escalation');
      expect(emitter.pfcCalls[0]!.decision).toBe('neutral');
    });

    it('emits escalation thought when NOT escalating', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]), undefined, emitter);

      await pfc.evaluateEscalation({
        trigger: 'test',
        context: 'test',
        confidence: 0.8,
      });

      expect(emitter.pfcCalls[0]!.thoughtType).toBe('escalation');
      expect(emitter.pfcCalls[0]!.decision).toBe('neutral');
      expect(emitter.pfcCalls[0]!.reason).toBe('confidence sufficient');
    });

    it('works normally without thoughtEmitter (optional dependency)', async () => {
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor(['echo']));

      const decision = await pfc.evaluateToolExecution('echo', {}, undefined);
      expect(decision.approved).toBe(true);
    });

    it('setThoughtEmitter enables late-binding', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor([]));

      // No emitter yet — should work fine
      await pfc.reflect('output', {
        output: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        tier: 3,
      });
      expect(emitter.emitPfcDecision).not.toHaveBeenCalled();

      // Late-bind emitter
      pfc.setThoughtEmitter(emitter);
      await pfc.reflect('output', {
        output: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        tier: 3,
      });
      expect(emitter.emitPfcDecision).toHaveBeenCalledTimes(1);
    });

    it('setTraceId sets traceId on emitted PFC decisions', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor(['echo']), undefined, emitter);

      pfc.setTraceId('test-trace-uuid');
      await pfc.evaluateToolExecution('echo', {}, undefined);

      expect(emitter.pfcCalls[0]!.traceId).toBe('test-trace-uuid');
    });

    it('traceId defaults to empty string when setTraceId not called', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor(['echo']), undefined, emitter);

      await pfc.evaluateToolExecution('echo', {}, undefined);

      expect(emitter.pfcCalls[0]!.traceId).toBe('');
    });

    it('setTraceId can be called multiple times (per-turn reset)', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor(['echo']), undefined, emitter);

      pfc.setTraceId('trace-1');
      await pfc.evaluateToolExecution('echo', {}, undefined);
      expect(emitter.pfcCalls[0]!.traceId).toBe('trace-1');

      pfc.setTraceId('trace-2');
      await pfc.evaluateToolExecution('echo', {}, undefined);
      expect(emitter.pfcCalls[1]!.traceId).toBe('trace-2');
    });

    it('setTraceId propagates to all 9 emission sites', async () => {
      const emitter = mockThoughtEmitter();
      const pfc = new PfcEngine(mockConfig(3), mockToolExecutor(['echo']), undefined, emitter);

      pfc.setTraceId('propagation-test-id');

      // 1. evaluateConfidenceGovernance (1 site)
      await pfc.evaluateConfidenceGovernance(
        createEvaluationInput({
          governance: 'may',
          actionCategory: 'model-invoke',
          confidenceSignal: {
            tier: 'high',
            confidence: 0.95,
            supportingSignals: 22,
            decayState: 'stable',
          },
        }),
      );

      // 2-3. evaluateMemoryWrite deny + approve (2 sites)
      await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.3,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );
      await pfc.evaluateMemoryWrite(
        {
          content: 'test',
          type: 'fact',
          scope: 'project',
          confidence: 0.8,
          sensitivity: [],
          retention: 'permanent',
          provenance: {
            traceId: '00000000-0000-0000-0000-000000000001' as never,
            source: 'test',
            timestamp: new Date().toISOString(),
          },
          tags: [],
        },
        undefined,
      );

      // 4. emitMemoryMutationThought (1 site, via evaluateMemoryMutation)
      await pfc.evaluateMemoryMutation({
        action: 'soft-delete',
        actor: 'core',
        targetEntryId: '00000000-0000-0000-0000-000000000002' as never,
        reason: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        evidenceRefs: [],
      });

      // 5-6. evaluateToolExecution deny + approve (2 sites)
      await pfc.evaluateToolExecution('unknown_tool', {}, undefined);
      await pfc.evaluateToolExecution('echo', {}, undefined);

      // 7. reflect (1 site)
      await pfc.reflect('output', {
        output: 'test',
        traceId: '00000000-0000-0000-0000-000000000001' as never,
        tier: 3,
      });

      // 8-9. evaluateEscalation escalate + no-escalate (2 sites)
      await pfc.evaluateEscalation({
        trigger: 'low_confidence',
        context: 'test',
        confidence: 0.2,
      });
      await pfc.evaluateEscalation({
        trigger: 'test',
        context: 'test',
        confidence: 0.8,
      });

      // All 9 emission sites should carry the trace ID
      expect(emitter.pfcCalls).toHaveLength(9);
      for (const call of emitter.pfcCalls) {
        expect(call.traceId).toBe('propagation-test-id');
      }
    });
  });
});
