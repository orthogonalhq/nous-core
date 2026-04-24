/**
 * WR-162 SP 4 — Default `DetectorContext` factory.
 *
 * SDS § Boundaries § Interfaces item 2 (DetectorContext readonly + frozen
 * runtime guarantee) and § Detector-by-detector mechanism ledger § SUP-007
 * (verify memoisation).
 *
 * The factory builds a per-observation frozen context from:
 *   - a clock (`now`),
 *   - an optional `BudgetReadonlyView` (null if no tracker registered),
 *   - an optional `ToolSurfaceReadonlyView` (resolved from the observation's
 *     `agentClass` via the injected `AgentClassToolSurfaceRegistry`),
 *   - an `IWitnessService` reference wrapped in a memoised verify +
 *     `hasAuthorizationForAction` view.
 *
 * `Object.freeze` at build time guarantees detectors cannot mutate context
 * even if a future edit accidentally removes the `readonly` TypeScript
 * annotation.
 */
import type {
  AgentClass,
  CriticalActionCategory,
  ILogChannel,
  IWitnessService,
  SupervisorObservation,
  VerificationReport,
  WitnessEvent,
} from '@nous/shared';
import type {
  AgentClassToolSurfaceRegistry,
} from './agent-class-tool-surface.js';
import { defaultAgentClassToolSurfaceRegistry } from './agent-class-tool-surface.js';
import { hasAuthorizationForAction } from './authorization-lookup.js';
import type {
  BudgetReadonlyView,
  DetectorContext,
  ToolSurfaceReadonlyView,
  WitnessReadonlyView,
} from './detection/types.js';

export interface DetectorContextFactoryDeps {
  readonly witnessService: IWitnessService;
  readonly toolSurfaceRegistry?: AgentClassToolSurfaceRegistry;
  readonly getBudgetView?: (runId: string | null) => BudgetReadonlyView | null;
  readonly readEventsForAuthorization?: () => Promise<readonly WitnessEvent[]>;
  readonly now?: () => string;
  readonly logger?: ILogChannel;
}

export type DetectorContextFactory = (
  observation: SupervisorObservation,
) => DetectorContext;

function buildToolSurfaceView(
  registry: AgentClassToolSurfaceRegistry,
  agentClass: AgentClass,
): ToolSurfaceReadonlyView {
  const allowed = registry.getAllowedToolsForClass(agentClass);
  const allowedSet = new Set(allowed);
  return Object.freeze({
    agentClass,
    allowedToolNames: allowed,
    isAllowed: (toolName: string): boolean => {
      if (allowedSet.has('*')) return true;
      return allowedSet.has(toolName);
    },
  });
}

function buildWitnessView(
  witnessService: IWitnessService,
  readEventsForAuthorization: DetectorContextFactoryDeps['readEventsForAuthorization'],
): WitnessReadonlyView {
  let memoised: Promise<VerificationReport> | null = null;
  return Object.freeze({
    verify: (): Promise<VerificationReport> => {
      if (memoised === null) {
        memoised = witnessService.verify();
      }
      return memoised;
    },
    hasAuthorizationForAction: async (params: {
      actionCategory: CriticalActionCategory;
      actionRef: string;
    }): Promise<boolean> => {
      return hasAuthorizationForAction(
        witnessService,
        params,
        readEventsForAuthorization,
      );
    },
  });
}

/**
 * Build a frozen `DetectorContext` for a single observation. Call once per
 * `runClassifier(observation)` invocation — the memoised verify promise
 * lives inside the returned witness view, so re-using a context across
 * observations would leak state.
 */
export function createDetectorContextFactory(
  deps: DetectorContextFactoryDeps,
): DetectorContextFactory {
  const registry = deps.toolSurfaceRegistry ?? defaultAgentClassToolSurfaceRegistry;
  const now = deps.now ?? ((): string => new Date().toISOString());
  const getBudgetView =
    deps.getBudgetView ?? ((_runId): BudgetReadonlyView | null => null);
  return (observation: SupervisorObservation): DetectorContext => {
    const toolSurface: ToolSurfaceReadonlyView | null =
      observation.agentClass !== null
        ? buildToolSurfaceView(registry, observation.agentClass)
        : null;
    const budget: BudgetReadonlyView | null = getBudgetView(observation.runId);
    const witness: WitnessReadonlyView = buildWitnessView(
      deps.witnessService,
      deps.readEventsForAuthorization,
    );
    const context: DetectorContext = Object.freeze({
      now,
      budget,
      toolSurface,
      witness,
      logger: deps.logger,
    });
    return context;
  };
}
