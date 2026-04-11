/**
 * Ollama endpoint configuration helper.
 *
 * Provides a shared function for reading the Ollama endpoint from the
 * NousContext config. All tRPC routers that need the Ollama base URL
 * call getOllamaEndpointFromContext(ctx) instead of using a hardcoded
 * constant. Falls back to DEFAULT_OLLAMA_BASE_URL when no custom
 * endpoint is configured.
 */
import type { NousContext } from './context';
import { OLLAMA_WELL_KNOWN_PROVIDER_ID } from './bootstrap';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Read the Ollama endpoint from the current config context.
 *
 * Looks up the Ollama provider entry by well-known ID or `isLocal` flag,
 * then returns the configured endpoint (or the default fallback).
 *
 * This is a pure read with no caching — the user may change the endpoint
 * at any time from settings.
 */
export function getOllamaEndpointFromContext(ctx: NousContext): string {
  const config = ctx.config.get() as {
    providers?: Array<{ id?: string; endpoint?: string; isLocal?: boolean }>;
  };
  const ollamaProvider = config.providers?.find(
    (p) => p.id === OLLAMA_WELL_KNOWN_PROVIDER_ID || p.isLocal,
  );
  return ollamaProvider?.endpoint ?? DEFAULT_OLLAMA_BASE_URL;
}
