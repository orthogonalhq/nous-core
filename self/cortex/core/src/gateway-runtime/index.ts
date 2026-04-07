export { createPrincipalSystemGatewayRuntime, PrincipalSystemGatewayRuntime } from './principal-system-runtime.js';
export { GatewayRuntimeIngressAdapter } from './ingress-adapter.js';
export { DocumentBacklogStore } from './backlog-store.js';
export { SystemBacklogQueue } from './backlog-queue.js';
export {
  BacklogAnalyticsSchema,
  BacklogEntrySchema,
  BacklogEntryStatusSchema,
  BacklogPressureTrendSchema,
  BacklogPrioritySchema,
  BacklogQueueConfigSchema,
  GATEWAY_RUNTIME_BACKLOG_COLLECTION,
} from './backlog-types.js';
export {
  GATEWAY_CHAT_COMPLETION_SCHEMA_REF,
  GatewayBackedTurnExecutor,
} from './gateway-turn-executor.js';
export { PublicMcpRuntimeAdapter } from './public-mcp-runtime-adapter.js';
export { createGatewayProjectApi } from './project-api.js';
export {
  createPrincipalCommunicationToolSurface,
  getPrincipalCommunicationToolDefinitions,
  INJECT_DIRECTIVE_TO_SYSTEM_TOOL_NAME,
  SUBMIT_TASK_TO_SYSTEM_TOOL_NAME,
} from './system-inbox-tools.js';
export { SystemContextReplicaProvider } from './system-context-replica.js';
export { GatewayRuntimeHealthSink } from './runtime-health.js';
export { GatewayTraceRecorder } from './trace-recorder.js';
export {
  ChatTurnInputSchema,
  ChatTurnResultSchema,
} from './types.js';
export type {
  ChatTurnInput,
  ChatTurnResult,
  GatewayAppSessionHealthProjection,
  GatewayBootSnapshot,
  GatewayBootStatus,
  GatewayBootStep,
  GatewayHealthSnapshot,
  GatewaySubmissionSource,
  IPrincipalSystemGatewayRuntime,
  MwcPipelineLike,
  PrincipalSystemGatewayRuntimeDeps,
  SystemContextReplica,
  SystemDirectiveInjection,
  SystemSubmissionReceipt,
  SystemTaskSubmission,
} from './types.js';
export type {
  BacklogAnalytics,
  BacklogEntry,
  BacklogEntryStatus,
  BacklogPriority,
  BacklogPressureTrend,
  BacklogQueueConfig,
} from './backlog-types.js';
export type { SystemBacklogQueueDeps, SystemBacklogSubmission } from './backlog-queue.js';
export type { GatewayRuntimeProjectApiDeps } from './project-api.js';
export type { GatewayBackedTurnExecutorDeps } from './gateway-turn-executor.js';
export type {
  PublicMcpRuntimeAdapterDeps,
  PublicMcpRuntimeInvocation,
  PublicMcpRuntimeInvocationResult,
} from './public-mcp-runtime-adapter.js';

// WR-127 SP 1.2 — factory, resolver, composer
export { HarnessGatewayFactory } from './harness-gateway-factory.js';
export type { HarnessGatewayFactoryDeps, HarnessGatewayCreateArgs } from './harness-gateway-factory.js';
export { resolveContextBudget } from './context-budget-resolver.js';
export type {
  ContextBudgetResolutionContext,
  ContextBudgetSettings,
  ContextBudgetSettingsSource,
} from './context-budget-resolver.js';
export { composeFromProfile } from './prompt-composer.js';
