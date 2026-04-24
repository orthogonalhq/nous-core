/**
 * WR-162 SP 3 IT-3 — bootstrap wiring smoke test.
 *
 * Reproduces the composition-root wiring that `bootstrap.ts` performs for
 * supervisor observability, without running the full service graph (see
 * `bootstrap.test.ts` for the precedent of smoke-testing bootstrap
 * surface-by-surface). Proves:
 *
 * 1. `SupervisorService` is a concrete instance with the expected surface.
 * 2. `gatewayRuntime.startSupervision({ enabled: true })` returns an
 *    active `ISupervisorHandle` and is idempotent (handle reference
 *    equality on second call).
 * 3. `MaoProjectionService` constructs compile-cleanly with the new
 *    optional `supervisorService` dep. (DNR-B3 transitive is locked by
 *    IT-2 — this test deliberately does not duplicate that assertion.)
 * 4. `supervisor.enabled: false` disposition flows through: the returned
 *    handle is inert (`isActive() === false`).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IEscalationService,
  IModelRouter,
  IOpctlService,
  IScheduler,
  IWorkflowEngine,
} from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '@nous/cortex-core';
import {
  SupervisorService,
  SupervisorOutboxSink,
} from '@nous/subcortex-supervisor';
import { MaoProjectionService } from '@nous/subcortex-mao';

function idFactory(): () => string {
  let counter = 0;
  return () => {
    const suffix = String(counter).padStart(12, '0');
    counter += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}

function stubModelRouter(): IModelRouter {
  return {
    route: vi.fn(),
    routeWithEvidence: vi.fn(),
    listProviders: vi.fn().mockResolvedValue([]),
  };
}

function stubOpctlService(): IOpctlService {
  return {
    submitCommand: vi.fn(),
    requestConfirmationProof: vi.fn(),
    validateConfirmationProof: vi.fn(),
    resolveScope: vi.fn(),
    hasStartLock: vi.fn(async () => false),
    setStartLock: vi.fn(),
    getProjectControlState: vi.fn(async () => 'running'),
  } as unknown as IOpctlService;
}

function stubWorkflowEngine(): IWorkflowEngine {
  return {
    resolveDefinition: vi.fn(),
    resolveDefinitionSource: vi.fn(),
    deriveGraph: vi.fn(),
    evaluateAdmission: vi.fn(),
    start: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    completeNode: vi.fn(),
    executeReadyNode: vi.fn(),
    continueNode: vi.fn(),
    getState: vi.fn(),
    listProjectRuns: vi.fn(async () => []),
    getRunGraph: vi.fn(),
  } as unknown as IWorkflowEngine;
}

function stubEscalationService(): IEscalationService {
  return {
    notify: vi.fn(),
    checkResponse: vi.fn(),
    get: vi.fn(),
    listProjectQueue: vi.fn(async () => []),
    acknowledge: vi.fn(),
  } as unknown as IEscalationService;
}

function stubScheduler(): IScheduler {
  return {
    register: vi.fn(),
    upsert: vi.fn(),
    get: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(async () => []),
  } as unknown as IScheduler;
}

describe('IT-3 — bootstrap supervisor wiring (WR-162 SP 3)', () => {
  it('bootstrap.ts imports @nous/subcortex-supervisor and constructs SupervisorService', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'bootstrap.ts'),
      'utf-8',
    );
    expect(src).toContain("from '@nous/subcortex-supervisor'");
    expect(src).toContain('new SupervisorService(');
    expect(src).toContain('new SupervisorOutboxSink(');
    expect(src).toContain('gatewayRuntime.startSupervision(');
  });

  it('SupervisorService is a concrete class with the expected lifecycle surface', () => {
    const svc = new SupervisorService({
      config: { enabled: true, maxObservationQueueDepth: 16 },
    });
    expect(svc).toBeInstanceOf(SupervisorService);
    expect(typeof svc.startSupervision).toBe('function');
    expect(typeof svc.stopSupervision).toBe('function');
    expect(typeof svc.getRecentViolations).toBe('function');
    expect(typeof svc.getStatusSnapshot).toBe('function');
    expect(typeof svc.getSentinelRiskScores).toBe('function');
    expect(typeof svc.getAgentSupervisorSnapshot).toBe('function');
  });

  it('gatewayRuntime.startSupervision({ enabled: true }) returns an active idempotent handle', () => {
    const supervisorService = new SupervisorService({
      config: { enabled: true, maxObservationQueueDepth: 16 },
    });
    const gatewayRuntime = createPrincipalSystemGatewayRuntime({
      modelRouter: stubModelRouter(),
      getProvider: () => null,
      idFactory: idFactory(),
      supervisorService,
      createSupervisorOutboxSink: (s) =>
        new SupervisorOutboxSink(s as SupervisorService),
    });

    const h1 = gatewayRuntime.startSupervision({ enabled: true });
    expect(h1.isActive()).toBe(true);
    const h2 = gatewayRuntime.startSupervision({ enabled: true });
    expect(h2).toBe(h1);
  });

  it('gatewayRuntime.startSupervision({ enabled: false }) returns an inert handle (SUPV-SP3-002)', () => {
    const supervisorService = new SupervisorService({
      config: { enabled: false, maxObservationQueueDepth: 16 },
    });
    const gatewayRuntime = createPrincipalSystemGatewayRuntime({
      modelRouter: stubModelRouter(),
      getProvider: () => null,
      idFactory: idFactory(),
      supervisorService,
      createSupervisorOutboxSink: (s) =>
        new SupervisorOutboxSink(s as SupervisorService),
    });

    const handle = gatewayRuntime.startSupervision({ enabled: false });
    expect(handle.isActive()).toBe(false);
  });

  it('MaoProjectionService constructs with the new supervisorService dep', () => {
    const supervisorService = new SupervisorService({
      config: { enabled: true, maxObservationQueueDepth: 16 },
    });
    const mao = new MaoProjectionService({
      opctlService: stubOpctlService(),
      workflowEngine: stubWorkflowEngine(),
      escalationService: stubEscalationService(),
      schedulerService: stubScheduler(),
      supervisorService,
    });
    expect(mao).toBeInstanceOf(MaoProjectionService);
  });
});
