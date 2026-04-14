// SP 1.5 — CortexRuntime replaces PrincipalSystemGatewayRuntime as the
// default export. The harness is now wired into createGatewayConfig(),
// providing equivalent behavior through the composable adapter pattern
// instead of the old wrapProviderWithInputTransform/synthesizeTaskComplete hacks.
export {
  CortexRuntime as PrincipalSystemGatewayRuntime,
  createCortexRuntime as createPrincipalSystemGatewayRuntime,
} from './cortex-runtime.js';

// Named CortexRuntime exports for direct use.
export { CortexRuntime, createCortexRuntime } from './cortex-runtime.js';
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

// Dev notification tools — Principal-only bypass tools for behavioral testing (WR-151 SP 1.4)
export {
  createDevNotificationToolSurface,
  getDevNotificationToolDefinitions,
  SEED_TEST_NOTIFICATIONS_TOOL_NAME,
  CLEAR_ALL_NOTIFICATIONS_TOOL_NAME,
  FIRE_TEST_TOAST_TOOL_NAME,
} from './dev-notification-tools.js';
export type { DevNotificationToolSurfaceArgs } from './dev-notification-tools.js';

// Prompt fragments — domain-specific guidance injected into Principal task instructions
export { CARD_PROMPT_FRAGMENT } from './card-prompt-fragment.js';
export { WORKFLOW_PROMPT_FRAGMENT } from './workflow-prompt-fragment.js';
