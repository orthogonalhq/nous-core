// ---------------------------------------------------------------------------
// registry.ts — Card registration and lookup
// ---------------------------------------------------------------------------
// FALLBACK IMPLEMENTATION: @openuidev/react-lang v0.1.4 is not available on
// npm (the published versions start at a later range). This module implements
// the same public API using a simple in-memory Map registry instead of
// wrapping OpenUI's `defineComponent`. The public interface (registerNousCard,
// getCardRegistry) remains identical — when/if @openuidev packages become
// available at the expected version, only this file needs to change.
// ---------------------------------------------------------------------------

import type { NousCardDefinition, NousCardRegistry } from './types'

const cardRegistry = new Map<string, NousCardDefinition>()

/**
 * Register a card definition in the adapter registry.
 * If a card with the same name already exists, it is overwritten.
 */
export function registerNousCard(definition: NousCardDefinition): void {
  cardRegistry.set(definition.name, definition)
}

/**
 * Returns a read-only view of the card registry.
 */
export function getCardRegistry(): NousCardRegistry {
  return {
    has(name: string): boolean {
      return cardRegistry.has(name)
    },
    get(name: string): NousCardDefinition | undefined {
      return cardRegistry.get(name)
    },
    list(): string[] {
      return Array.from(cardRegistry.keys())
    },
  }
}

/**
 * Clear all registered cards. Exposed for testing only.
 * @internal
 */
export function _clearRegistry(): void {
  cardRegistry.clear()
}
