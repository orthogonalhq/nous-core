/**
 * @nous/cortex-core — Central execution loop for Nous-OSS.
 *
 * Export groups:
 * 1. Workmode — admission guard, registry, canonical modes
 * 2. Chat — scope resolution, intent classification, thread binding
 * 3. Ingress — trigger validation, authn/authz, dispatch admission
 * 4. Recovery — checkpoint, retry, rollback, orchestration
 * 5. Output parsing — model output normalization
 * 6. AgentGateway — gateway class, factory, budget, correlation, inbox/outbox
 * 7. Internal MCP — tool surface, authorization matrix, lifecycle/capability handlers
 * 8. Public MCP — execution bridge for external MCP tools
 * 9. Prompts — system prompt templates
 * 10. Gateway runtime — boot sequence, turn executor bridge, backlog, health
 */

// ── 1. Workmode ──────────────────────────────────────────────────────────────
export {
  InMemoryWorkmodeRegistry,
  InMemoryLeaseStore,
  WorkmodeAdmissionGuard,
  CANONICAL_SYSTEM_WORKMODES,
  SYSTEM_IMPLEMENTATION,
  SYSTEM_ARCHITECTURE,
  SYSTEM_SKILL_AUTHORING,
  evaluateLifecycleAdmission,
} from './workmode/index.js';

// ── 2. Chat ──────────────────────────────────────────────────────────────────
export {
  ChatScopeResolver,
  ChatIntentClassifier,
  ChatControlRouter,
  InMemoryChatThreadStore,
  ChatThreadBindGuard,
} from './chat/index.js';

// ── 3. Ingress ───────────────────────────────────────────────────────────────
export {
  IngressTriggerValidator,
  IngressAuthnVerifier,
  IngressAuthzEvaluator,
  InMemoryIngressIdempotencyStore,
  IngressDispatchAdmission,
  IngressGateway,
} from './ingress/index.js';

// ── 4. Recovery ──────────────────────────────────────────────────────────────
export {
  InMemoryRecoveryLedgerStore,
  CheckpointManager,
  RetryPolicyEvaluator,
  RollbackPolicyEvaluator,
  RecoveryOrchestrator,
} from './recovery/index.js';

// ── 5. Output parsing ────────────────────────────────────────────────────────
export { parseModelOutput, detectAndStripNarration } from './output-parser.js';
export type { ParsedModelOutput } from './output-parser.js';

// ── 6. AgentGateway ──────────────────────────────────────────────────────────
export {
  AgentGateway,
  AgentGatewayFactory,
  BudgetTracker,
  CorrelationSequencer,
  GatewayInbox,
  GatewayOutbox,
  InMemoryGatewayOutboxSink,
  composeSystemPrompt,
  createInboxFrame,
  estimateBudgetUnits,
  estimateUsageUnits,
} from './agent-gateway/index.js';

// ── 7. Internal MCP — tool surface, authorization, lifecycle/capability ──────
export {
  DefaultSchemaRefValidator,
  ScopedMcpToolSurface,
  PassthroughOutputSchemaValidator,
  createCapabilityHandlers,
  createInternalMcpSurfaceBundle,
  createLifecycleHandlers,
  createScopedMcpToolSurface,
  getAuthorizedAppInternalMcpTools,
  getAuthorizedInternalMcpTools,
  getDynamicInternalMcpToolEntry,
  getInternalMcpCatalogEntry,
  getPublicToolMapping,
  isAppInternalMcpToolAuthorized,
  resolvePublicMcpRequiredScopes,
  getVisiblePublicToolMappings,
  hasRequiredPublicMcpScopes,
  getVisibleInternalMcpTools,
  INTERNAL_MCP_CATALOG,
  listDynamicInternalMcpToolEntries,
  PUBLIC_MCP_TOOL_MAPPINGS,
  registerDynamicInternalMcpTool,
  unregisterDynamicInternalMcpTool,
} from './internal-mcp/index.js';
export type {
  DynamicInternalMcpToolEntry,
  InternalMcpDispatchChildArgs,
  InternalMcpDispatchRuntime,
  InternalMcpOutputSchemaValidator,
  InternalMcpRuntimeDeps,
  InternalMcpSurfaceBundle,
  InternalMcpToolName,
} from './internal-mcp/index.js';

// ── 8. Public MCP — execution bridge ─────────────────────────────────────────
export {
  PublicMcpExecutionBridge,
} from './public-mcp/index.js';
export type {
  IPublicMcpExecutionBridge,
  PublicMcpExecutionBridgeOptions,
  PublicMcpInternalExecutor,
} from './public-mcp/index.js';

// ── 9. Prompts ───────────────────────────────────────────────────────────────
export {
  WORKFLOW_ROUTER_SYSTEM_PROMPT,
  ORCHESTRATOR_SYSTEM_PROMPT,
} from './prompts/index.js';

// ── 10. Gateway runtime — boot, turn executor bridge, backlog, health ────────
export {
  createPrincipalSystemGatewayRuntime,
  DocumentBacklogStore,
  GatewayRuntimeIngressAdapter,
  SystemBacklogQueue,
  GatewayBackedTurnExecutor,
  PublicMcpRuntimeAdapter,
  GatewayTraceRecorder,
  GATEWAY_CHAT_COMPLETION_SCHEMA_REF,
  createGatewayProjectApi,
  createPrincipalCommunicationToolSurface,
  getPrincipalCommunicationToolDefinitions,
  INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME,
  SUBMIT_TASK_TO_SYSTEM_TOOL_NAME,
  SystemContextReplicaProvider,
  GatewayRuntimeHealthSink,
} from './gateway-runtime/index.js';
export type {
  GatewayAppSessionHealthProjection,
  GatewayBootSnapshot,
  GatewayBootStatus,
  GatewayBootStep,
  GatewayHealthSnapshot,
  BacklogAnalytics,
  BacklogEntry,
  BacklogPriority,
  BacklogQueueConfig,
  GatewaySubmissionSource,
  GatewayBackedTurnExecutorDeps,
  PublicMcpRuntimeAdapterDeps,
  PublicMcpRuntimeInvocation,
  PublicMcpRuntimeInvocationResult,
  GatewayRuntimeProjectApiDeps,
  IPrincipalSystemGatewayRuntime,
  PrincipalSystemGatewayRuntimeDeps,
  SystemContextReplica,
  SystemDirectiveInjection,
  SystemSubmissionReceipt,
  SystemTaskSubmission,
} from './gateway-runtime/index.js';
