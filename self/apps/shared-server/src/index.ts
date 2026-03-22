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
  loadModelSelection,
  registerStoredProviders,
  WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig,
  buildProviderConfig,
  currentRoleAssignment,
  updateRoleAssignment,
} from './bootstrap';
export type { BootstrapConfig } from './bootstrap';
export type { NousContext, AgentSessionEntry } from './context';
export { appRouter } from './trpc/root';
export type { AppRouter } from './trpc/root';
export { createTRPCContext, router, publicProcedure } from './trpc/trpc';
export {
  OllamaBinaryResolutionSchema,
  OllamaLifecycleStateSchema,
  OllamaModelPullProgressSchema,
  OllamaStatusSchema,
  detectOllama,
  pullOllamaModel,
  resolveOllamaBinary,
} from './ollama-detection';
export type {
  OllamaBinaryResolution,
  OllamaLifecycleState,
  OllamaModelPullProgress,
  OllamaStatus,
} from './ollama-detection';
