/**
 * WR-162 SP 4 — Detector function shapes, readonly views, and candidate types.
 *
 * Canonical sources:
 * - SDS § Boundaries § Interfaces item 2 (DetectorContext + views).
 * - SDS § Boundaries § Interfaces item 3 (DetectorFn + SupervisorViolationCandidate).
 * - SDS § Invariants SUPV-SP4-002 (detector purity).
 *
 * Detectors are pure functions. They receive a frozen `DetectorContext` and
 * an enriched `SupervisorObservation` and return either a candidate or
 * `null`. No side effects — no EventBus publish, no WitnessService write,
 * no mutation of context. The `detector-purity-invariant.test.ts`
 * reflection test locks this by reading each detector file's imports and
 * invoking it against spy dependencies.
 */
import type {
  AgentClass,
  CriticalActionCategory,
  GatewayBudgetExhaustionReason,
  ILogChannel,
  SupCode,
  SupervisorObservation,
  SupervisorSeverity,
  VerificationReport,
} from '@nous/shared';

/**
 * Read-only view over a per-run `BudgetTracker`. The bootstrap layer is
 * responsible for providing a concrete view — SP 4 exposes stubbable
 * accessors so detectors never reach into mutable tracker state.
 */
export interface BudgetReadonlyView {
  readonly getExhaustedReason: () => GatewayBudgetExhaustionReason | null;
  readonly getSpawnBudgetExceeded: () => boolean;
}

/**
 * Read-only tool-surface view. Populated by the default `DetectorContext`
 * factory from `AgentClassToolSurfaceRegistry` keyed off the observation's
 * `agentClass`. `'*'` in `allowedToolNames` is a wildcard bypass (cortex
 * tier classes only).
 */
export interface ToolSurfaceReadonlyView {
  readonly agentClass: AgentClass;
  readonly allowedToolNames: readonly string[];
  readonly isAllowed: (toolName: string) => boolean;
}

/**
 * Read-only witness view. `verify()` is memoised per context instance so
 * multiple detectors in the same classify loop pay a single verify call.
 * `hasAuthorizationForAction` is backed by `authorization-lookup.ts` (a
 * verify-report scan) — SP 4 does NOT add a new method to
 * `IWitnessService` (SP 5+ may).
 */
export interface WitnessReadonlyView {
  readonly verify: () => Promise<VerificationReport>;
  readonly hasAuthorizationForAction: (params: {
    actionCategory: CriticalActionCategory;
    actionRef: string;
  }) => Promise<boolean>;
}

export interface DetectorContext {
  readonly now: () => string;
  readonly budget: BudgetReadonlyView | null;
  readonly toolSurface: ToolSurfaceReadonlyView | null;
  readonly witness: WitnessReadonlyView;
  readonly logger?: ILogChannel;
}

/**
 * Detector return-value candidate. Identity fields (`agentId`, `runId`,
 * `projectId`, `agentClass`) and `evidenceRefs`/`detectedAt` are joined in
 * by the classifier/service path after witness write; detectors do NOT
 * populate them.
 */
export interface SupervisorViolationCandidate {
  readonly supCode: SupCode;
  readonly severity: SupervisorSeverity;
  readonly reason: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * Detector function signature. Promise-returning because SUP-004 and SUP-007
 * need to await the witness read surface. Pure: no class state, no captured
 * mutable variables, no side effects.
 */
export type DetectorFn = (
  input: SupervisorObservation,
  context: DetectorContext,
) => Promise<SupervisorViolationCandidate | null>;
