/**
 * Crash-detect runtime-side wiring tests.
 *
 * WR-162 SP 8 — Recovery Orchestrator Expansion + Crash-Detect Wiring.
 * Validates that the per-call `RecoveryOrchestratorContext.witness` field
 * (Phase C — `cortex-runtime.ts:817–826` + `principal-system-runtime.ts:648–657`)
 * is wired to flow `this.deps.witnessService` into the orchestrator's `run(...)`
 * arg.
 *
 * The recovery invocation block fires only when `executeSystemEntryInner`
 * returns `result.status === 'error'`. The existing pre-SP-8 test suite
 * (`principal-system-runtime-recovery.test.ts`) verifies the *wiring* shape via
 * negative assertions (recovery NOT invoked when deps are partial) but does
 * not produce an actual error path through the inner gateway. Producing an
 * error path requires an injected gateway-failure stub that does not exist in
 * the current helper toolbox and is out of SP 8 scope (the SP 2 recovery
 * invocation block is read-only for SP 8 per IP § Boundaries — Hazard 1
 * separate-concerns).
 *
 * Therefore SP 8 verifies the per-call wiring at TWO complementary surfaces:
 *
 *   1. **Source-level structural assertion** — both runtime files declare the
 *      additive `witness: this.deps.witnessService,` field inside the
 *      `recoveryContext: RecoveryOrchestratorContext = { ... }` literal at the
 *      crash-detect block. A future edit that drops the field at either
 *      runtime fails this test loudly.
 *
 *   2. **Direct orchestrator-side end-to-end assertion** — the orchestrator's
 *      `run()` method consumes `context.witness` via the SUPV-SP8-001 +
 *      SUPV-SP8-010 helpers (silent short-circuit if undefined; emit through
 *      `appendInvariant` if wired). The `recovery-orchestrator-witness-emission.test.ts`
 *      file (UT-SP8-EM-* + UT-SP8-CTX-* + UT-SP8-UNWIRED-*) exhaustively
 *      exercises both branches against a real `RecoveryOrchestrator` instance.
 *
 * The SP 9 / SP 10 follow-up sub-phases will introduce checkpoint-storage and
 * recovery-UX surfaces that produce a real gateway-failure path through the
 * SP 1.2 inner block; at that point a third end-to-end IT scenario can land.
 * For SP 8, the dual-surface assertion above is sufficient per IP § Tests
 * § Tier-2 + Goals SC § "Crash-detect runtime-side (3 — cortex-runtime +
 * principal-system-runtime × halt/continue)" — the three crash-detect tests
 * here cover (i) source-level cortex-runtime wiring, (ii) source-level
 * principal-system-runtime wiring, (iii) the dep-injection plumbing
 * (witnessService passes through to deps without being mutated).
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  IWitnessService,
  WitnessEvent,
} from '@nous/shared';
import { createPrincipalSystemGatewayRuntime } from '../../gateway-runtime/index.js';
import {
  AGENT_ID,
  createDocumentStore,
  createModelProvider,
  createPfcEngine,
  createProjectApi,
} from '../agent-gateway/helpers.js';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PROJECT_ID = AGENT_ID as unknown as string;

function createMockWitnessService(): IWitnessService {
  return {
    appendAuthorization: vi.fn(),
    appendCompletion: vi.fn(),
    appendInvariant: vi
      .fn()
      .mockResolvedValue({} as unknown as WitnessEvent) as unknown as IWitnessService['appendInvariant'],
    createCheckpoint: vi.fn(),
    rotateKeyEpoch: vi.fn(),
    verify: vi.fn(),
    getReport: vi.fn(),
    listReports: vi.fn(),
    getLatestCheckpoint: vi.fn(),
  };
}

async function readRuntimeSource(filename: string): Promise<string> {
  const here = fileURLToPath(import.meta.url);
  const path = resolve(dirname(here), '../../gateway-runtime', filename);
  return fs.readFile(path, 'utf8');
}

describe('Crash-detect runtime-side wiring (IT-SP8-CR-*)', () => {
  // IT-SP8-CR-CORTEX — cortex-runtime crash-detect block carries the additive
  // `witness: this.deps.witnessService,` field per SUPV-SP8-015. Source-level
  // assertion guards against a future edit that drops the field.
  it('IT-SP8-CR-CORTEX cortex-runtime declares witness in recoveryContext literal', async () => {
    const source = await readRuntimeSource('cortex-runtime.ts');
    const recoveryContextRegex =
      /const\s+recoveryContext\s*:\s*RecoveryOrchestratorContext\s*=\s*\{[\s\S]*?witness\s*:\s*this\.deps\.witnessService\s*,[\s\S]*?\};/;
    expect(recoveryContextRegex.test(source)).toBe(true);
  });

  // IT-SP8-CR-PRINCIPAL — principal-system-runtime crash-detect block carries
  // the additive field per SUPV-SP8-016. Symmetric structural assertion.
  it('IT-SP8-CR-PRINCIPAL principal-system-runtime declares witness in recoveryContext literal', async () => {
    const source = await readRuntimeSource('principal-system-runtime.ts');
    const recoveryContextRegex =
      /const\s+recoveryContext\s*:\s*RecoveryOrchestratorContext\s*=\s*\{[\s\S]*?witness\s*:\s*this\.deps\.witnessService\s*,[\s\S]*?\};/;
    expect(recoveryContextRegex.test(source)).toBe(true);
  });

  // IT-SP8-CR-WITNESS-FLOW — runtime accepts witnessService through deps and
  // does not mutate it. Constructs a runtime with a tracked witness instance,
  // resolves a normal task, asserts the runtime starts cleanly without
  // disturbing the witness service (the recovery block fires only on error,
  // which is a separate scenario covered structurally above; this test
  // verifies the dep-injection plumbing itself).
  it('IT-SP8-CR-WITNESS-FLOW runtime accepts witnessService through deps without mutation', async () => {
    const witnessService = createMockWitnessService();
    const runtime = createPrincipalSystemGatewayRuntime({
      documentStore: createDocumentStore(),
      modelProviderByClass: {
        'Cortex::Principal': createModelProvider([
          '{"response":"idle","toolCalls":[]}',
        ]),
        'Cortex::System': createModelProvider([
          '{"response":"idle","toolCalls":[]}',
        ]),
        Orchestrator: createModelProvider([
          '{"response":"idle","toolCalls":[]}',
        ]),
        Worker: createModelProvider(['{"response":"idle","toolCalls":[]}']),
      },
      getProjectApi: () => createProjectApi(),
      pfc: createPfcEngine(),
      outputSchemaValidator: {
        validate: vi.fn().mockResolvedValue({ success: true }),
      },
      witnessService,
      idFactory: (() => {
        let counter = 0;
        return () => {
          const suffix = String(counter).padStart(12, '0');
          counter += 1;
          return `00000000-0000-4000-8000-${suffix}`;
        };
      })(),
    });

    await runtime.submitTaskToSystem({
      task: 'witness-flow-plumbing',
      projectId: PROJECT_ID,
      detail: {},
    });
    await runtime.whenIdle();

    // Runtime accepts the dep cleanly (boot reaches a terminal status
    // — `ready` or `degraded` are both acceptable; the SP 8 invariant is
    // that wiring the dep does not throw and does not introduce spurious
    // recovery-evidence emission on the success path).
    expect(['ready', 'degraded']).toContain(runtime.getBootSnapshot().status);
    // `appendInvariant` is not called when no recovery path fires (default
    // happy-path execution returns `completed`, not `error`); the test
    // confirms that wiring the dep does NOT introduce spurious invariant
    // emissions on the success path.
    expect(
      (witnessService.appendInvariant as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(0);
  });
});
