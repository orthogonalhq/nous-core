// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { getRegistryEntry } from '../nodes/node-registry'

const KNOWN_NOUS_TYPES = [
  'nous.trigger.webhook',
  'nous.agent.classify',
  'nous.condition.branch',
  'nous.app.slack-notify',
  'nous.tool.vector-search',
  'nous.memory.write',
  'nous.governance.audit-log',
]

const REQUIRED_FIELDS = [
  'category',
  'defaultLabel',
  'ports',
  'colorVar',
  'width',
  'height',
  'icon',
] as const

describe('node-registry', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it.each(KNOWN_NOUS_TYPES)(
      'getRegistryEntry returns an entry for "%s"',
      (nousType) => {
        const entry = getRegistryEntry(nousType)
        expect(entry).toBeDefined()
        expect(entry.category).toBeTruthy()
      },
    )

    it.each(KNOWN_NOUS_TYPES)(
      'entry for "%s" has all required fields',
      (nousType) => {
        const entry = getRegistryEntry(nousType)
        for (const field of REQUIRED_FIELDS) {
          expect(entry).toHaveProperty(field)
          expect((entry as Record<string, unknown>)[field]).toBeDefined()
        }
      },
    )
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('returns fallback entry with category "tool" for unknown nousType', () => {
      const entry = getRegistryEntry('nous.tool.unknown-action')
      expect(entry).toBeDefined()
      expect(entry.category).toBe('tool')
    })

    it('resolves category-level fallback — "nous.trigger.unknown" matches trigger entry', () => {
      const entry = getRegistryEntry('nous.trigger.unknown')
      expect(entry.category).toBe('trigger')
    })
  })

  // ─── Tier 3 — Edge Case ────────────────────────────────────────────────────

  describe('Tier 3 — Edge Case', () => {
    it('completely unknown namespace returns fallback', () => {
      const entry = getRegistryEntry('com.unknown.something')
      expect(entry).toBeDefined()
      expect(entry.category).toBe('tool')
      expect(entry.defaultLabel).toBe('Unknown')
    })

    it('empty string returns fallback', () => {
      const entry = getRegistryEntry('')
      expect(entry).toBeDefined()
      expect(entry.category).toBe('tool')
    })
  })
})
