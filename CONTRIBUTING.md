# Contributing to Nous

Nous has a deliberate trust gradient that mirrors its own architecture. Contributions at the edges of the system are open to newcomers. Contributions at the core require earned context. This is explicit, not gatekeeping.

---

## Prerequisites

- **Node.js 22+**
- **pnpm 10+** (`corepack enable && corepack prepare pnpm@latest --activate`)

```bash
git clone https://github.com/orthogonalhq/nous-core.git
cd nous-core
pnpm install
pnpm build
pnpm test
```

If Electron's binary doesn't download during install, run `node node_modules/electron/install.js` manually — pnpm v10's build-script allowlisting can block it.

All code lives under `self/`. Shared types and interface contracts live in `self/shared/`. Architecture docs live in `.architecture/`.

---

## Contribution Tiers

The tiers are a ladder, not a taxonomy. Start at the edges — build an adapter, learn the contracts, understand how information flows between layers. The deeper tiers open naturally from there.

### Tier 1: Integrations (Edges)

**Communication adapters, model provider adapters, agent adapters, MCP tool integrations.**

You need to know the external tool and the interface contract. You don't need to understand the Cortex or the memory system.

#### Communication Channel Apps

Communication channel integrations are **Nous Apps** — sandboxed Deno subprocesses that declare their permissions in a manifest, register namespaced tools into the Internal MCP catalog, and store credentials in the encrypted vault.

A channel integration App:
- Declares required permissions in its `NousPackageManifest` (`network`, credential vault entries)
- Stores API keys and bot tokens in the credential vault — credentials are injected at runtime, never exposed directly
- Registers namespaced tools (e.g., `discord.send`, `discord.list_channels`) into the Internal MCP catalog
- Implements ingress normalization: maps platform events into `ChannelIngressEnvelope`
- Delivers egress messages from `ChannelEgressEnvelope`

**Dependency**: Building channel Apps requires the Nous App SDK — dev docs and SDK coming. Watch this repo for the release.

**Reference** (normalization pattern): `self/apps/bridge/src/connectors/telegram-bot-adapter.ts` — ingress normalization, egress delivery, mention detection, message type inference.

**What it looks like**: scaffold a new App (`self/apps/<platform>/`), declare its manifest with credential vault entries and tool declarations, implement ingress/egress normalization, write tests.

#### Model Provider Adapters

```typescript
// self/shared/src/interfaces/subcortex.ts
export interface IModelProvider {
  invoke(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
  getConfig(): ModelProviderConfig;
}
```

**Reference implementations**: `self/subcortex/providers/src/ollama-provider.ts` (local Ollama) and `openai-provider.ts` (OpenAI-compatible).

**What it looks like**: implement `IModelProvider` for a new backend (Anthropic, Gemini, Mistral, local GGUF), validate inputs against `TextModelInputSchema`, export from the providers package.

#### MCP Tool Surface Extensions

The internal MCP tool surface (`self/cortex/core/src/internal-mcp/`) exposes capability tools to agents through a scoped, authorization-gated catalog. The current 14 tools cover memory, artifacts, tool execution, witness, escalation, scheduling, and lifecycle operations.

```typescript
// self/cortex/core/src/internal-mcp/types.ts
export type InternalMcpCapabilityHandler = (
  params: unknown,
  execution?: GatewayExecutionContext,
) => Promise<ToolResult>;
```

Each tool is a handler function registered in the catalog (`catalog.ts`) and gated by an authorization matrix (`authorization-matrix.ts`) that controls which agent classes can access which tools.

**What it looks like**: propose and implement a new capability tool — define the handler, add its catalog entry and Zod input schema, wire it into the authorization matrix, write tests.

#### Agent Adapters

The `AgentAdapter` interface (`self/shared/src/types/adapter.ts`) wraps external AI agents so Nous can orchestrate and benchmark them:

```typescript
// self/shared/src/types/adapter.ts
export interface AgentAdapter {
  readonly metadata: AdapterMetadata;
  prepare(input: PrepareInput): Promise<PrepareOutput>;
  execute(input: ExecuteInput): Promise<ExecuteOutput>;
  captureTrace(input: CaptureInput): Promise<TraceBundle>;
  captureSideEffects(input: CaptureInput): Promise<SideEffectBundle>;
  collectArtifacts(input: CaptureInput): Promise<ArtifactBundle>;
  cleanup(input: CleanupInput): Promise<CleanupOutput>;
}
```

This is the contract for wrapping any external agent — Claude Code, Codex, Devin, custom agents — so Nous can dispatch tasks to them and capture structured results. All input/output types have Zod schemas for runtime validation.

**What it looks like**: implement `AgentAdapter` for an external agent, mapping its CLI or API into the prepare/execute/capture/cleanup lifecycle. Write tests against the Zod schemas.

---

### Tier 2: Skill System Refinement

**Tightening skill definitions, improving the prose type system, refining validation.**

The skill system has admission, contract validation, and benchmark evaluation:

```typescript
// self/shared/src/interfaces/subcortex.ts
export interface ISkillAdmissionOrchestrator {
  validateSkillContract(input: SkillContractValidationRequest): Promise<SkillContractValidationResult>;
  evaluateSkillBench(input: SkillBenchEvaluationRequest): Promise<SkillBenchEvaluationResult>;
  evaluateAttributionThesis(input: SkillAttributionThesisRequest): Promise<SkillAttributionThesisResult>;
  requestAdmission(input: SkillAdmissionRequest): Promise<SkillAdmissionResult>;
  // ...
}
```

Skill types live in `self/shared/src/types/`. The engineering SOP and process models live in `.skills/`.

This tier is for someone who's been using Nous, has built skills, and has noticed friction. Contributions are still task-shaped but require system familiarity.

---

### Tier 3: UI and Projection Interfaces

**Skill builder, workflow projection, MAO dashboard, themes.**

The desktop app: `self/apps/desktop/` (Electron 34 + React 19 + dockview-react v4). Shared UI: `self/ui/` (stub — not yet populated). Web: `self/apps/web/` (Next.js 14+ with tRPC).

Key projection interfaces that drive the UI:

```typescript
// self/shared/src/interfaces/subcortex.ts
export interface IMaoProjectionService {
  getAgentProjections(projectId: ProjectId): Promise<MaoAgentProjection[]>;
  getProjectSnapshot(input: MaoProjectSnapshotInput): Promise<MaoProjectSnapshot>;
  getRunGraphSnapshot(input: MaoProjectSnapshotInput): Promise<MaoRunGraphSnapshot>;
  requestProjectControl(input: MaoProjectControlRequest, ...): Promise<MaoProjectControlResult>;
}
```

This tier requires understanding both what the system does underneath and how to represent it visually.

**Stack notes**: dockview-react v4 does not accept a `style` prop — wrap in a div. electron-store must be v8 (CJS; v9+ is ESM-only and incompatible with electron-vite). electron-vite v2 requires Vite 5 (not 6).

---

### Tier 4: Contextual Memory Streaming Harness

**How context flows through the system in real time. What gets retained. How retrieval works during active operation.**

The memory system spans 8 packages under `self/memory/`:

- **STM** (`IStmStore`) — working context, append/compact/clear
- **LTM** (`ILtmStore`) — structured facts, write/query/export/supersede
- **Distillation** (`IDistillationEngine`) — cluster identification, pattern compression, confidence decay/refresh, supersession reversal
- **Retrieval** (`IRetrievalEngine`) — sentiment-weighted, budget-constrained, context-shaped
- **Access** (`IMemoryAccessPolicyEngine`) — cross-project access policies, deterministic evaluation
- **Knowledge Index** (`IKnowledgeIndex`) — project meta-vectors, taxonomy, discovery

All interfaces: `self/shared/src/interfaces/memory.ts`.

No good-first-issues here. Work at this depth means proposing, not picking up tasks — it requires the kind of context that comes from time in the codebase.

---

### Tier 5: Core Agent Orchestration Loop

**The Cortex execution loop. Decision-making architecture. The coordination layer that composes everything.**

```typescript
// self/shared/src/interfaces/cortex.ts
export interface ICoreExecutor {
  executeTurn(input: TurnInput): Promise<TurnResult>;
  superviseProject(projectId: ProjectId): Promise<void>;
  getTrace(traceId: TraceId): Promise<ExecutionTrace | null>;
}

export interface IPfcEngine {
  evaluateConfidenceGovernance(input: ConfidenceGovernanceEvaluationInput): Promise<ConfidenceGovernanceEvaluationResult>;
  evaluateMemoryWrite(candidate: MemoryWriteCandidate, projectId?: ProjectId): Promise<PfcDecision>;
  evaluateToolExecution(toolName: string, params: unknown, projectId?: ProjectId): Promise<PfcDecision>;
  reflect(output: unknown, context: ReflectionContext): Promise<ReflectionResult>;
  evaluateEscalation(situation: EscalationSituation): Promise<EscalationDecision>;
}
```

The AgentGateway (`self/shared/src/interfaces/agent-gateway.ts`) implements a deterministic 6-step turn loop with hard budget ceilings, correlation chains, and mandatory witness linkage.

The core orchestration loop and memory architecture are not open for drive-by contributions — not because we're gatekeeping, but because a change at that depth requires context that only comes from time in the system. If you've been contributing at Tiers 1-3 and you're starting to see how the deeper layers connect, open a Discussion. That's how the deeper work starts.

---

## Contribution Map

| If you're interested in... | Look at | Start with | Tier |
|---|---|---|---|
| Chat platform adapters (Discord, Matrix, etc.) | `self/apps/bridge/src/connectors/` | `telegram-bot-adapter.ts` as reference | 1 |
| Model provider adapters (Anthropic, Gemini, etc.) | `self/subcortex/providers/src/` | `ollama-provider.ts` as reference | 1 |
| Agent adapters (Claude Code, Codex, etc.) | `self/shared/src/types/adapter.ts` | `AgentAdapter` interface and Zod schemas | 1 |
| MCP tool extensions | `self/cortex/core/src/internal-mcp/` | `catalog.ts` and `capability-handlers.ts` | 1 |
| Communication gateway runtime | `self/subcortex/communication-gateway/src/` | `delivery-orchestrator.ts` | 1 |
| Skill contracts and validation | `self/shared/src/types/` (skill types) | Existing type definitions | 2 |
| Desktop UI panels and layout | `self/apps/desktop/` | dockview panel registration | 3 |
| Web interface | `self/apps/web/` | tRPC routes and pages | 3 |
| MAO dashboard | `self/subcortex/mao/` | `MaoAgentProjection` types | 3 |
| Memory distillation | `self/memory/distillation/` | Read the interface first | 4 |
| Retrieval engine | `self/memory/retrieval/` | Read the interface first | 4 |
| Execution loop | `self/cortex/core/` | Read `the-mind-model.md` first | 5 |
| Witness chain | `self/subcortex/witnessd/` | Read `IWitnessService` interface | 5 |

---

## Code Conventions

**Types and interfaces**: Strongly typed interface contracts, compiler-enforced. Every layer boundary has an explicit interface in `self/shared/src/interfaces/`. Changes to public interfaces will get scrutiny.

**Validation**: Zod schemas are the single source of truth for runtime validation. Types are inferred from schemas where possible.

**Naming**: camelCase for variables/functions, PascalCase for types/classes, kebab-case for file names. Interface names prefixed with `I` (e.g., `IModelProvider`).

**Linting**: `pnpm lint` runs oxlint across `self/`. No eslint.

**Testing**: vitest. Tests live alongside source in `__tests__/` directories. `pnpm test` from root.

**Module format**: ESM everywhere. No CJS except where forced by dependencies (better-sqlite3, electron-store v8).

---

## PR Process

We're opinionated about interface contracts and typed boundaries. If your PR changes a public interface, expect discussion. If it adds a well-scoped feature within existing contracts, expect a fast merge.

**Before submitting**:
1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm test` passes
4. `pnpm build` succeeds

**Commit format** (conventional commits):
```
feat(subcortex-providers): add Anthropic model provider
fix(memory-retrieval): correct sentiment weight decay calculation
docs(architecture): update mind model diagram
chore(deps): bump vitest to 4.x
```

Scope is the package name or system area. Check `git log --oneline -20` for recent examples.

---

## What's Not Ready Yet

Honesty over polish:

- **No LICENSE file yet.** This is a blocker for external contributions. Must be resolved before public launch.
- **No Discord or community channel.** Discussions happen through GitHub Issues and Discussions for now.
- **`self/ui/` is a stub.** The desktop app works, but the shared component library is not yet populated.
- **No automated release pipeline.** CI is functional (typecheck, lint, test, benchmark, build across 3 OSes) with tiered checks across `dev`, `staging`, and `main`. Release path is `dev → staging → main`, but there's no publish/release automation yet.
- **Docs site not deployed.** `docs/` exists as a Next.js app but isn't live yet.

---

## Good First Issues

Browse current good first issues on [GitHub Issues](https://github.com/orthogonalhq/nous-core/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

---

## Larger Initiatives

These are roadmap-level efforts that go beyond a single PR. They're listed here because they represent real directions the project is heading — if one of these resonates, open a Discussion.

### Headless Email Client

A fully headless, agent-operated email surface built as a **Nous App** — a sandboxed Deno subprocess with IMAP/SMTP credentials in the credential vault, and namespaced tools (`email.search`, `email.draft`, `email.send`, `email.reply`, `email.archive`) registered into the Internal MCP catalog.

IMAP IDLE drives a live feed of new messages into the communication gateway ingress. Outgoing mail routes through the escalation service — high-confidence replies auto-send, low-confidence ones escalate to the Principal. The witness chain audits everything. The memory system learns communication patterns over time.

Not yet tied to a specific phase. It's not a contribution you pick up — it's one you propose and design collaboratively. See [issue #78](https://github.com/orthogonalhq/nous-core/issues/78) for the full design.
