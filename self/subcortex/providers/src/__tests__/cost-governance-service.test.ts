import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CostGovernanceService } from '../cost-governance-service.js';
import { ModelPricingRegistry } from '../model-pricing-registry.js';
import type {
  IEventBus,
  IOpctlService,
  InferenceCallCompletePayload,
  ProjectConfig,
  ModelPricingEntry,
  ProjectId,
} from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';

// --- Helpers ---

type Handler = (payload: any) => void;

function createMockEventBus(): IEventBus & {
  handlers: Map<string, Handler>;
  simulateEvent: (channel: string, payload: any) => void;
} {
  const handlers = new Map<string, Handler>();
  let subId = 0;
  return {
    handlers,
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation((channel: string, handler: Handler) => {
      const id = `sub-${subId++}`;
      handlers.set(id, handler);
      handlers.set(`channel:${channel}`, handler);
      return id;
    }),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
    simulateEvent(channel: string, payload: any) {
      const handler = handlers.get(`channel:${channel}`);
      if (handler) handler(payload);
    },
  };
}

function createMockOpctlService(): IOpctlService {
  return {
    submitCommand: vi.fn().mockResolvedValue({ status: 'applied' }),
    requestConfirmationProof: vi.fn(),
    validateConfirmationProof: vi.fn(),
    resolveScope: vi.fn(),
    hasStartLock: vi.fn(),
    setStartLock: vi.fn(),
    releaseStartLock: vi.fn(),
    getProjectControlState: vi.fn(),
  } as unknown as IOpctlService;
}

function createPricingEntry(overrides?: Partial<ModelPricingEntry>): ModelPricingEntry {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    inputPricePerMillionTokens: 3,
    outputPricePerMillionTokens: 15,
    effectiveAt: new Date().toISOString(),
    ...overrides,
  };
}

function createCallCompletePayload(
  overrides?: Partial<InferenceCallCompletePayload>,
): InferenceCallCompletePayload {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    agentClass: 'Cortex::Principal',
    traceId: 'trace-1',
    projectId: 'project-1',
    laneKey: 'lane-1',
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    latencyMs: 200,
    emittedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createProjectConfig(
  overrides?: Partial<ProjectConfig>,
): ProjectConfig {
  return {
    id: 'project-1' as ProjectId,
    name: 'Test Project',
    type: 'autonomous',
    pfcTier: 'tier-2',
    governanceDefaults: {
      defaultNodeGovernance: 'must',
      requireExplicitReviewForShouldDeviation: true,
      blockedActionFeedbackMode: 'reason_coded',
    },
    modelAssignments: undefined,
    memoryAccessPolicy: { canReadFrom: [], canBeReadBy: [] },
    escalationChannels: ['in_app'],
    escalationPreferences: {
      routeByPriority: {
        low: ['projects'],
        medium: ['projects'],
        high: ['projects', 'chat', 'mobile'],
        critical: ['projects', 'chat', 'mao', 'mobile'],
      },
      acknowledgementSurfaces: ['projects', 'chat', 'mobile'],
      mirrorToChat: true,
    },
    packageDefaultIntake: [],
    retrievalBudgetTokens: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    costBudget: {
      enabled: true,
      hardCeilingDollars: 100,
      softThresholdPercent: 80,
      periodType: 'monthly',
      systemScopeExempt: true,
    },
    ...overrides,
  } as ProjectConfig;
}

describe('CostGovernanceService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let opctlService: ReturnType<typeof createMockOpctlService>;
  let pricingRegistry: ModelPricingRegistry;
  let projectConfigs: Map<string, ProjectConfig>;
  let service: CostGovernanceService;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = createMockEventBus();
    opctlService = createMockOpctlService();
    pricingRegistry = new ModelPricingRegistry();
    pricingRegistry.setEntry(createPricingEntry());
    projectConfigs = new Map();
    projectConfigs.set('project-1', createProjectConfig());

    service = new CostGovernanceService({
      eventBus,
      opctlService,
      pricingRegistry,
      getProjectConfig: (id) => projectConfigs.get(id) ?? null,
    });
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  // --- Cost Calculation ---

  describe('token-to-dollar conversion', () => {
    it('calculates cost correctly from token counts and pricing', () => {
      // 1M input tokens at $3/M = $3.00
      // 500K output tokens at $15/M = $7.50
      // Total = $10.50
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      const snapshot = service.getProjectCostSnapshot('project-1', 'period');
      expect(snapshot).not.toBeNull();
      expect(snapshot!.totalCostDollars).toBeCloseTo(10.5, 6);

      const entries = snapshot!.entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.inputCostDollars).toBeCloseTo(3.0, 6);
      expect(entries[0]!.outputCostDollars).toBeCloseTo(7.5, 6);
    });

    it('accumulates across multiple events', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      const snapshot = service.getProjectCostSnapshot('project-1', 'period');
      expect(snapshot!.totalCostDollars).toBeCloseTo(21.0, 6);
      expect(snapshot!.entries[0]!.callCount).toBe(2);
    });

    it('handles stream-complete events identically', () => {
      eventBus.simulateEvent('inference:stream-complete', createCallCompletePayload());

      const snapshot = service.getProjectCostSnapshot('project-1', 'period');
      expect(snapshot!.totalCostDollars).toBeCloseTo(10.5, 6);
    });
  });

  // --- Per-Project Accumulation ---

  describe('per-project accumulation', () => {
    it('accumulates independently per project', () => {
      projectConfigs.set('project-2', createProjectConfig({ id: 'project-2' as ProjectId }));

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ projectId: 'project-1' }));
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ projectId: 'project-2' }));

      const snap1 = service.getProjectCostSnapshot('project-1', 'period');
      const snap2 = service.getProjectCostSnapshot('project-2', 'period');
      expect(snap1!.totalCostDollars).toBeCloseTo(10.5, 6);
      expect(snap2!.totalCostDollars).toBeCloseTo(10.5, 6);
    });

    it('returns null for unknown project', () => {
      expect(service.getProjectCostSnapshot('unknown', 'period')).toBeNull();
    });
  });

  // --- Soft Threshold ---

  describe('soft threshold', () => {
    it('fires once when soft threshold is crossed', () => {
      // Budget: $100, soft at 80% = $80
      // Each event: $10.50 → need 8 events to cross $80 (8 * $10.50 = $84)
      for (let i = 0; i < 8; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const alertCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'cost:budget-alert',
      );
      const softAlerts = alertCalls.filter(
        (call: unknown[]) => (call[1] as any).alertLevel === 'soft_threshold',
      );
      expect(softAlerts).toHaveLength(1);
    });

    it('does not re-fire on subsequent events', () => {
      // Push past soft threshold
      for (let i = 0; i < 9; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const alertCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) =>
          call[0] === 'cost:budget-alert' && (call[1] as any).alertLevel === 'soft_threshold',
      );
      expect(alertCalls).toHaveLength(1);
    });

    it('emits escalation:new when soft threshold fires', () => {
      for (let i = 0; i < 8; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const escalationCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'escalation:new',
      );
      expect(escalationCalls).toHaveLength(1);
      expect((escalationCalls[0]![1] as any).severity).toBe('medium');
    });
  });

  // --- Hard Ceiling ---

  describe('hard ceiling', () => {
    it('fires once when hard ceiling is crossed and triggers opctl pause', () => {
      // Budget: $100, need 10 events (10 * $10.50 = $105)
      for (let i = 0; i < 10; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const hardAlerts = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) =>
          call[0] === 'cost:budget-alert' && (call[1] as any).alertLevel === 'hard_ceiling',
      );
      expect(hardAlerts).toHaveLength(1);
      expect(opctlService.submitCommand).toHaveBeenCalledTimes(1);

      const envelope = (opctlService.submitCommand as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(envelope.action).toBe('pause');
      expect(envelope.scope.project_id).toBe('project-1');
      expect(envelope.actor_type).toBe('orchestration_agent');
    });

    it('does not trigger opctl pause on subsequent events', () => {
      for (let i = 0; i < 12; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      expect(opctlService.submitCommand).toHaveBeenCalledTimes(1);
    });

    it('still accumulates cost after hard ceiling', () => {
      for (let i = 0; i < 12; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const snapshot = service.getProjectCostSnapshot('project-1', 'period');
      expect(snapshot!.totalCostDollars).toBeCloseTo(126.0, 6);
    });
  });

  // --- System-Scope Exemption ---

  describe('system-scope exemption', () => {
    it('skips events with SYSTEM_SCOPE_SENTINEL_PROJECT_ID', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({
        projectId: SYSTEM_SCOPE_SENTINEL_PROJECT_ID,
      }));

      expect(service.getProjectCostSnapshot(SYSTEM_SCOPE_SENTINEL_PROJECT_ID, 'period')).toBeNull();
    });

    it('skips events with undefined projectId', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({
        projectId: undefined,
      }));

      // No accumulators created
      expect(service.getProjectCostSnapshot('project-1', 'period')).toBeNull();
    });
  });

  // --- Unpriced Models ---

  describe('unpriced models', () => {
    it('accumulates tokens with zero cost for unpriced models', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({
        providerId: 'local',
        modelId: 'llama3',
      }));

      const snapshot = service.getProjectCostSnapshot('project-1', 'period');
      expect(snapshot!.totalCostDollars).toBe(0);
      expect(snapshot!.entries[0]!.inputTokens).toBe(1_000_000);
      expect(snapshot!.entries[0]!.callCount).toBe(1);
    });
  });

  // --- Period Rotation ---

  describe('period rotation', () => {
    it('monthly period resets on calendar month boundary', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getProjectCostSnapshot('project-1', 'period')!.totalCostDollars).toBeCloseTo(10.5, 6);

      // Advance to the next month
      const now = new Date();
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2));
      vi.setSystemTime(nextMonth);

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      // Should only have the new event's cost
      expect(service.getProjectCostSnapshot('project-1', 'period')!.totalCostDollars).toBeCloseTo(10.5, 6);
    });

    it('weekly period resets on ISO week boundary', () => {
      projectConfigs.set('project-1', createProjectConfig({
        costBudget: {
          enabled: true,
          hardCeilingDollars: 100,
          softThresholdPercent: 80,
          periodType: 'weekly',
          systemScopeExempt: true,
        },
      }));

      // Force new accumulator creation with weekly period
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      // Advance to next Monday
      const now = new Date();
      const daysUntilMonday = ((8 - now.getUTCDay()) % 7) || 7;
      const nextMonday = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilMonday,
        1,
      ));
      vi.setSystemTime(nextMonday);

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getProjectCostSnapshot('project-1', 'period')!.totalCostDollars).toBeCloseTo(10.5, 6);
    });

    it('resets threshold flags on period rotation', () => {
      // Cross soft threshold
      for (let i = 0; i < 8; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const softAlertsBefore = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) =>
          call[0] === 'cost:budget-alert' && (call[1] as any).alertLevel === 'soft_threshold',
      );
      expect(softAlertsBefore).toHaveLength(1);

      // Advance to next month (reset)
      const now = new Date();
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2));
      vi.setSystemTime(nextMonth);

      // Clear mock calls to count fresh
      (eventBus.publish as ReturnType<typeof vi.fn>).mockClear();

      // Cross soft threshold again in new period
      for (let i = 0; i < 8; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const softAlertsAfter = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) =>
          call[0] === 'cost:budget-alert' && (call[1] as any).alertLevel === 'soft_threshold',
      );
      expect(softAlertsAfter).toHaveLength(1);
    });

    it('none period never rotates', () => {
      projectConfigs.set('project-1', createProjectConfig({
        costBudget: {
          enabled: true,
          hardCeilingDollars: 1000,
          softThresholdPercent: 80,
          periodType: 'none',
          systemScopeExempt: true,
        },
      }));

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      // Advance a year
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      vi.setSystemTime(future);

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      // Should have accumulated both events
      expect(service.getProjectCostSnapshot('project-1', 'period')!.totalCostDollars).toBeCloseTo(21.0, 6);
    });
  });

  // --- Budget Status ---

  describe('getBudgetStatus()', () => {
    it('returns correct status for project with budget', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      const status = service.getBudgetStatus('project-1');
      expect(status).not.toBeNull();
      expect(status!.currentSpendDollars).toBeCloseTo(10.5, 6);
      expect(status!.hardCeilingDollars).toBe(100);
      expect(status!.softThresholdDollars).toBe(80);
      expect(status!.percentUsed).toBeCloseTo(10.5, 4);
      expect(status!.alertLevel).toBe('normal');
      expect(status!.isPaused).toBe(false);
    });

    it('returns null for project without budget policy', () => {
      projectConfigs.set('no-budget', createProjectConfig({
        id: 'no-budget' as ProjectId,
        costBudget: undefined,
      }));

      expect(service.getBudgetStatus('no-budget')).toBeNull();
    });

    it('reflects hard_ceiling alert level when paused', () => {
      for (let i = 0; i < 10; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      }

      const status = service.getBudgetStatus('project-1');
      expect(status!.alertLevel).toBe('hard_ceiling');
      expect(status!.isPaused).toBe(true);
    });
  });

  // --- Provider Breakdown ---

  describe('getProviderBreakdown()', () => {
    it('returns per-provider/model entries', () => {
      pricingRegistry.setEntry(createPricingEntry({ providerId: 'p2', modelId: 'm2', inputPricePerMillionTokens: 1, outputPricePerMillionTokens: 5 }));

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ providerId: 'p2', modelId: 'm2' }));

      const breakdown = service.getProviderBreakdown('project-1', 'period');
      expect(breakdown).toHaveLength(2);
    });

    it('returns empty for unknown project', () => {
      expect(service.getProviderBreakdown('unknown', 'period')).toEqual([]);
    });
  });

  // --- Pricing Delegation ---

  describe('pricing delegation', () => {
    it('getPricingTable delegates to registry', () => {
      expect(service.getPricingTable()).toHaveLength(1);
    });

    it('setPricingEntry delegates to registry', () => {
      service.setPricingEntry(createPricingEntry({ providerId: 'new', modelId: 'new' }));
      expect(service.getPricingTable()).toHaveLength(2);
    });

    it('removePricingEntry delegates to registry', () => {
      expect(service.removePricingEntry('provider-1', 'model-1')).toBe(true);
      expect(service.getPricingTable()).toHaveLength(0);
    });
  });

  // --- Dispose ---

  describe('dispose()', () => {
    it('unsubscribes from event bus and clears accumulators', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getProjectCostSnapshot('project-1', 'period')).not.toBeNull();

      service.dispose();

      expect(eventBus.unsubscribe).toHaveBeenCalledTimes(2);
      expect(service.getProjectCostSnapshot('project-1', 'period')).toBeNull();
    });

    it('ignores events after dispose', () => {
      service.dispose();
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getProjectCostSnapshot('project-1', 'period')).toBeNull();
    });
  });

  // --- Pause Envelope ---

  describe('pause envelope construction', () => {
    it('produces unique command IDs across multiple hard ceiling triggers', () => {
      // Need two projects both hitting ceiling
      projectConfigs.set('project-2', createProjectConfig({ id: 'project-2' as ProjectId }));

      for (let i = 0; i < 10; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ projectId: 'project-1' }));
      }
      for (let i = 0; i < 10; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ projectId: 'project-2' }));
      }

      const calls = (opctlService.submitCommand as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);

      const envelope1 = calls[0]![0] as any;
      const envelope2 = calls[1]![0] as any;
      expect(envelope1.control_command_id).not.toBe(envelope2.control_command_id);
      expect(envelope1.nonce).not.toBe(envelope2.nonce);
      expect(envelope1.actor_seq).toBeLessThan(envelope2.actor_seq);
    });
  });
});
