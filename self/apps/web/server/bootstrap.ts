/**
 * Bootstrap — wires the Nous stack for the web app.
 *
 * Thin adapter over @nous/shared-server. The platform-agnostic service graph
 * lives in shared-server; this file adds web-specific caching and env wiring.
 */
import { createNousServices } from '@nous/shared-server';
import type { NousContext } from '@nous/shared-server';

export type { NousContext };

let cachedContext: NousContext | null = null;

export function clearNousContextCache(): void {
  cachedContext = null;
}

export function createNousContext(): NousContext {
  if (cachedContext) {
    return cachedContext;
  }

  cachedContext = createNousServices({
    runtimeLabel: 'web',
  });

  return cachedContext;
}
