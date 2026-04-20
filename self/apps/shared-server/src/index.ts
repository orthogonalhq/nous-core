/**
 * @nous/shared-server — Platform-agnostic Nous server bootstrap.
 *
 * Provides:
 * - `createNousServices(config?)` — instantiates the full service graph
 * - `appRouter` / `AppRouter` — the composed tRPC router
 * - `NousContext` — the tRPC context type
 * - `createTRPCContext` — tRPC context factory
 */
export {
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  createNousServices,
  loadStoredApiKeys,
  registerStoredProviders,
  WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig,
  buildProviderConfig,
  currentRoleAssignment,
  updateRoleAssignment,
} from './bootstrap';
export type { BootstrapConfig } from './bootstrap';
export type { NousContext, AgentSessionEntry } from './context';
export { EventBus, createEventSseHandler } from './event-bus/index.js';
export { appRouter } from './trpc/root';
export type { AppRouter } from './trpc/root';
export { createTRPCContext, router, publicProcedure } from './trpc/trpc';
export {
  HardwareSpecSchema,
  GpuInfoSchema,
  ModelRecommendationSchema,
  RoleModelRecommendationSchema,
  RecommendationResultSchema,
  ValidationStateSchema,
  detectHardware,
  recommendModels,
} from './hardware-detection';
export type {
  HardwareSpec,
  GpuInfo,
  ModelRecommendation,
  RoleModelRecommendation,
  RecommendationResult,
  RecommendationProfilePolicy,
  ValidationState,
} from './hardware-detection';
export {
  MINIMUM_OLLAMA_VERSION,
  OllamaBinaryResolutionSchema,
  OllamaLifecycleStateSchema,
  OllamaModelPullProgressSchema,
  OllamaStatusSchema,
  OllamaVersionParsedSchema,
  OllamaVersionResultSchema,
  REGISTRY_AVAILABILITY_CACHE_TTL_MS,
  REGISTRY_AVAILABILITY_TIMEOUT_MS,
  RegistryAvailabilityStateSchema,
  __resetRegistryAvailabilityCacheForTesting,
  checkRegistryAvailability,
  detectOllama,
  getOllamaVersion,
  meetsMinimumVersion,
  normalizeSpecForLocalLookup,
  pullOllamaModel,
  resolveOllamaBinary,
} from './ollama-detection';
export type {
  OllamaBinaryResolution,
  OllamaLifecycleState,
  OllamaModelPullProgress,
  OllamaStatus,
  OllamaVersionParsed,
  OllamaVersionResult,
  RegistryAvailabilityState,
} from './ollama-detection';
export {
  FirstRunActionResultSchema,
  FirstRunCurrentStepSchema,
  FirstRunPrerequisitesSchema,
  FirstRunRoleAssignmentInputSchema,
  FirstRunStateSchema,
  FirstRunStepSchema,
  FirstRunStepStateSchema,
  FirstRunStepStatusSchema,
  createDefaultFirstRunState,
  getCurrentStep,
  getFirstRunState,
  markStepComplete,
  resetFirstRunState,
} from './first-run';
export type {
  FirstRunActionResult,
  FirstRunCurrentStep,
  FirstRunPrerequisites,
  FirstRunRoleAssignmentInput,
  FirstRunState,
  FirstRunStep,
  FirstRunStepState,
  FirstRunStepStatus,
} from './first-run';
