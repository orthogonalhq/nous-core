/**
 * NOTE (WR-138 — 2026-04-08): This factory is NOT wired into production as of WR-138.
 * If it is adopted into `CortexRuntime.createGatewayConfig` in a future refactor,
 * the caller MUST thread the vendor string through
 * `HarnessGatewayCreateArgs.providerType` (line ~44) directly from
 * `ModelProviderConfig.vendor` — do NOT reintroduce name-string sniffing or
 * well-known UUID probing. See:
 *   - `cortex-provider-attach-lifecycle-v1.md` AC #9
 *   - `.worklog/sprints/fix/provider-type-plumbing/discovery/root-cause-manifest.mdx` Observation 1
 */
import type {
  AgentClass,
  AgentGatewayConfig,
  DispatchIntent,
  HarnessStrategies,
  IAgentGateway,
  IAgentGatewayFactory,
  IGatewayLifecycleHooks,
  IGatewayOutboxSink,
  IModelProvider,
  IModelRouter,
  IScopedMcpToolSurface,
  IWitnessService,
  ModelRequirements,
  PromptFormatterInput,
  TraceId,
} from '@nous/shared';
import type { ParsedModelOutput } from '../output-parser.js';
import { resolveAgentProfile } from './prompt-strategy.js';
import { resolveAdapter } from '../agent-gateway/adapters/index.js';
import { composeFromProfile } from './prompt-composer.js';
import { resolveContextBudget, type ContextBudgetSettingsSource } from './context-budget-resolver.js';
import { composeSystemPromptFromConfig } from './prompt-strategy.js';
import type { ProviderAdapter } from '../agent-gateway/adapters/types.js';

export interface HarnessGatewayFactoryDeps {
  agentGatewayFactory: IAgentGatewayFactory;
  modelRouter?: IModelRouter;
  getProvider?: (providerId: string) => IModelProvider | null;
  modelProviderByClass?: Partial<Record<AgentClass, IModelProvider>>;
  defaultModelRequirements?: ModelRequirements;
  witnessService?: IWitnessService;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: () => string;
  contextBudgetSources?: ContextBudgetSettingsSource[];
}

export interface HarnessGatewayCreateArgs {
  agentClass: AgentClass;
  agentId: string;
  toolSurface: IScopedMcpToolSurface;
  lifecycleHooks?: IGatewayLifecycleHooks;
  providerType: string;
  personalityConfig?: unknown;
  baseSystemPromptOverride?: string;
  outbox?: IGatewayOutboxSink;
  dispatchIntent?: DispatchIntent;
}

export class HarnessGatewayFactory {
  constructor(private readonly deps: HarnessGatewayFactoryDeps) {}

  create(args: HarnessGatewayCreateArgs): IAgentGateway {
    const profile = resolveAgentProfile(
      args.agentClass,
      args.providerType,
      args.personalityConfig,
    );
    const adapter = resolveAdapter(args.providerType);
    const harness = this.composeStrategies(profile, adapter, args.agentClass);

    const config: AgentGatewayConfig = {
      agentClass: args.agentClass,
      agentId: args.agentId as AgentGatewayConfig['agentId'],
      toolSurface: args.toolSurface,
      lifecycleHooks: args.lifecycleHooks,
      outbox: args.outbox,
      baseSystemPrompt: args.baseSystemPromptOverride
        ?? composeSystemPromptFromConfig(profile),
      harness,
      defaultModelRequirements: this.deps.defaultModelRequirements,
      witnessService: this.deps.witnessService,
      modelProvider: this.resolveProviderForClass(args.agentClass),
      modelRouter: this.deps.modelRouter,
      getProvider: this.deps.getProvider,
      now: this.deps.now,
      nowMs: this.deps.nowMs,
      idFactory: this.deps.idFactory,
    };

    return this.deps.agentGatewayFactory.create(config);
  }

  private composeStrategies(
    profile: ReturnType<typeof resolveAgentProfile>,
    adapter: ProviderAdapter,
    agentClass: AgentClass,
  ): HarnessStrategies {
    return {
      promptFormatter: (input: PromptFormatterInput) =>
        composeFromProfile(profile, adapter.capabilities, input),
      responseParser: (output: unknown, traceId: TraceId) =>
        adapter.parseResponse(output, traceId),
      contextStrategy: profile.contextBudget
        ? {
            getDefaults: () =>
              resolveContextBudget(
                { agentClass },
                profile.contextBudget!,
                this.deps.contextBudgetSources,
              ),
          }
        : undefined,
      loopConfig: profile.loopShape
        ? { singleTurn: profile.loopShape === 'single-turn' }
        : undefined,
    };
  }

  private resolveProviderForClass(agentClass: AgentClass): IModelProvider | undefined {
    return this.deps.modelProviderByClass?.[agentClass];
  }
}
