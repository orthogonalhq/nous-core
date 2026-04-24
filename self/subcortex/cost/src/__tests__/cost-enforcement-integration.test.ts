/**
 * WR-162 SP 7 — IT-SP7-1 — Cost-enforcement + MAO-observability cross-branch integration.
 *
 * Scenario A: enforcementEnabled=false + (external simulated) getBudgetStatus wire.
 *   - triggerPause records { skipped: true, reason_code: 'enforcement_disabled' }
 *   - CostGovernanceService.getBudgetStatus returns a populated BudgetStatus
 *     (validates the always-on observability wire is orthogonal to the flag).
 *
 * Scenario B: enforcementEnabled=true + seeded OpctlSubmitResult.
 *   - triggerPause submits (envelope, proof) where proof.signature is
 *     'system-issued-stub-sig' and envelope.action is 'pause'.
 *   - Log records { success: true } on status='applied'.
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  IEventBus,
  InferenceCallCompletePayload,
  BudgetPolicy,
} from '@nous/shared';
import { CostGovernanceService, type CostGovernanceServiceDeps } from '../cost-governance-service.js';
import { createPricingTable } from '../pricing-table.js';
import type { IOpctlServiceForEnforcement } from '../cost-enforcement.js';

type Handler = (payload: unknown) => void;

function createMockEventBus(): IEventBus & {
  handlers: Map<string, Handler[]>;
  fire(channel: string, payload: unknown): void;
} {
  const handlers = new Map<string, Handler[]>();
  return {
    handlers,
    publish(): void { /* no-op */ },
    subscribe(channel: string, handler: Handler): string {
      const list = handlers.get(channel) ?? [];
      list.push(handler);
      handlers.set(channel, list);
      return `sub-${channel}-${list.length}`;
    },
    unsubscribe(): void { /* no-op */ },
    dispose(): void { /* no-op */ },
    fire(channel: string, payload: unknown): void {
      const list = handlers.get(channel) ?? [];
      for (const h of list) h(payload);
    },
  } as IEventBus & {
    handlers: Map<string, Handler[]>;
    fire(channel: string, payload: unknown): void;
  };
}

function createMockOpctlService(submitCommand?: (..._args: unknown[]) => Promise<unknown>): IOpctlServiceForEnforcement {
  return {
    getProjectControlState: vi.fn().mockResolvedValue('running'),
    submitCommand: vi.fn(submitCommand ?? (() => Promise.resolve({
      status: 'applied',
      control_command_id: '00000000-0000-0000-0000-000000000000',
      target_ids_hash: 'a'.repeat(64),
    }))),
  } as IOpctlServiceForEnforcement;
}

function makePayload(overrides: Partial<InferenceCallCompletePayload> = {}): InferenceCallCompletePayload {
  return {
    projectId: 'project-1',
    providerId: 'openai',
    modelId: 'gpt-4o',
    agentClass: 'Reasoner',
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    traceId: 'trace-1',
    correlationRunId: 'run-1',
    correlationParentId: undefined,
    durationMs: 100,
    ...overrides,
  } as InferenceCallCompletePayload;
}

const PAUSE_TRIPPING_POLICY: BudgetPolicy = {
  enabled: true,
  period: 'monthly',
  softThresholdPercent: 50,
  hardCeilingUsd: 0.01, // very low — any event exceeds it
};

function buildService(deps: CostGovernanceServiceDeps): CostGovernanceService {
  return new CostGovernanceService(deps, { snapshotIntervalMs: 30_000 });
}

describe('IT-SP7-1 — cross-branch integration (flag-gated pause + always-on observability)', () => {
  // Scenario A: enforcementEnabled=false
  it('records skip on triggerPause AND serves BudgetStatus when enforcementEnabled=false', async () => {
    const eventBus = createMockEventBus();
    const opctlService = createMockOpctlService();
    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable: createPricingTable(),
      getProjectConfig: () => undefined,
      enforcementEnabled: false,
    };
    const service = buildService(deps);

    service.setBudgetPolicy('project-1', PAUSE_TRIPPING_POLICY);

    // Seed a single high-cost event — trips both soft + hard thresholds.
    eventBus.fire('inference:call-complete', makePayload());

    // Give the fire-and-forget enforcement promise a chance to settle.
    await new Promise((resolve) => setImmediate(resolve));

    // submitCommand must NOT have been called under the disabled flag.
    expect(opctlService.submitCommand).not.toHaveBeenCalled();

    // Enforcement log shows the skip record.
    const enforcement = service.getEnforcement();
    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      projectId: 'project-1',
      success: false,
      skipped: true,
      reason_code: 'enforcement_disabled',
    });

    // Always-on observability: getBudgetStatus returns a populated shape
    // independent of the flag.
    const status = service.getBudgetStatus('project-1');
    expect(status.hasBudget).toBe(true);
    expect(status.currentSpendUsd).toBeGreaterThan(0);
    expect(status.hardCeilingFired).toBe(true);

    service.dispose();
  });

  // Scenario B: enforcementEnabled=true + status=applied
  it('submits (envelope, system-issued proof) and records success on status=applied when enforcementEnabled=true', async () => {
    const eventBus = createMockEventBus();
    const submitCommand = vi.fn().mockResolvedValue({
      status: 'applied',
      control_command_id: '00000000-0000-0000-0000-000000000000',
      target_ids_hash: 'a'.repeat(64),
    });
    const opctlService: IOpctlServiceForEnforcement = {
      getProjectControlState: vi.fn().mockResolvedValue('running'),
      submitCommand,
    };
    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable: createPricingTable(),
      getProjectConfig: () => undefined,
      enforcementEnabled: true,
    };
    const service = buildService(deps);

    service.setBudgetPolicy('project-1', PAUSE_TRIPPING_POLICY);
    eventBus.fire('inference:call-complete', makePayload());

    await new Promise((resolve) => setImmediate(resolve));

    expect(submitCommand).toHaveBeenCalledOnce();
    const call = submitCommand.mock.calls[0]!;
    expect(call).toHaveLength(2);
    const envelope = call[0] as { action: string };
    const proof = call[1] as { signature: string; action: string };
    expect(envelope.action).toBe('pause');
    expect(proof.signature).toBe('system-issued-stub-sig');
    expect(proof.action).toBe('pause');

    const log = service.getEnforcement().getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(true);

    service.dispose();
  });

  // Scenario B variant: enforcementEnabled=true + status=blocked
  it('records { success: false, reason_code: "blocked" } on status=blocked under enforcementEnabled=true', async () => {
    const eventBus = createMockEventBus();
    const opctlService: IOpctlServiceForEnforcement = {
      getProjectControlState: vi.fn().mockResolvedValue('running'),
      submitCommand: vi.fn().mockResolvedValue({
        status: 'blocked',
        control_command_id: '00000000-0000-0000-0000-000000000000',
        reason: 'scope locked',
      }),
    };
    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable: createPricingTable(),
      getProjectConfig: () => undefined,
      enforcementEnabled: true,
    };
    const service = buildService(deps);
    service.setBudgetPolicy('project-1', PAUSE_TRIPPING_POLICY);
    eventBus.fire('inference:call-complete', makePayload());
    await new Promise((resolve) => setImmediate(resolve));

    const log = service.getEnforcement().getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
    expect(log[0]!.reason_code).toBe('blocked');

    service.dispose();
  });
});
