// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { getRegistryEntry, getAllRegistryEntries } from '../nodes/node-registry'

const KNOWN_NOUS_TYPES = [
  // Trigger (2)
  'nous.trigger.schedule',
  'nous.trigger.webhook',
  // Agent (2)
  'nous.agent.claude',
  'nous.agent.codex',
  // Condition (7)
  'nous.condition.if',
  'nous.condition.switch',
  'nous.condition.governance-gate',
  'nous.condition.parallel-split',
  'nous.condition.parallel-join',
  'nous.condition.loop',
  'nous.condition.error-handler',
  // App (2)
  'nous.app.http-request',
  'nous.app.slack',
  // Tool (2)
  'nous.tool.memory-search',
  'nous.tool.artifact-store',
  // Memory (3)
  'nous.memory.read',
  'nous.memory.write',
  'nous.memory.search',
  // Governance (3)
  'nous.governance.pfc-gate',
  'nous.governance.witness-checkpoint',
  'nous.governance.escalation',
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

const EXPECTED_CATEGORY_COUNTS: Record<string, number> = {
  trigger: 2,
  agent: 2,
  condition: 7,
  app: 2,
  tool: 2,
  memory: 3,
  governance: 3,
}

describe('node-registry', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('registry contains exactly 21 entries', () => {
      expect(getAllRegistryEntries()).toHaveLength(21)
    })

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
          expect((entry as unknown as Record<string, unknown>)[field]).toBeDefined()
        }
      },
    )

    it('category distribution matches spec', () => {
      const entries = getAllRegistryEntries()
      const counts: Record<string, number> = {}
      for (const [, entry] of entries) {
        counts[entry.category] = (counts[entry.category] ?? 0) + 1
      }
      expect(counts).toEqual(EXPECTED_CATEGORY_COUNTS)
    })

    it.each(KNOWN_NOUS_TYPES)(
      'entry for "%s" has correct category matching type namespace',
      (nousType) => {
        const entry = getRegistryEntry(nousType)
        const expectedCategory = nousType.split('.')[1]
        expect(entry.category).toBe(expectedCategory)
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

    it('trigger nodes have no input port', () => {
      for (const type of ['nous.trigger.schedule', 'nous.trigger.webhook']) {
        const entry = getRegistryEntry(type)
        const inputPorts = entry.ports.filter((p) => p.direction === 'input')
        expect(inputPorts).toHaveLength(0)
      }
    })

    it('branching nodes have multi: true on output port', () => {
      for (const type of [
        'nous.condition.if',
        'nous.condition.switch',
        'nous.condition.governance-gate',
        'nous.condition.parallel-split',
      ]) {
        const entry = getRegistryEntry(type)
        const outputPorts = entry.ports.filter((p) => p.direction === 'output')
        expect(outputPorts.some((p) => p.multi === true)).toBe(true)
      }
    })

    it('parallel-join has multi: true on input port', () => {
      const entry = getRegistryEntry('nous.condition.parallel-join')
      const inputPorts = entry.ports.filter((p) => p.direction === 'input')
      expect(inputPorts.some((p) => p.multi === true)).toBe(true)
    })

    it('dual-output nodes (loop, error-handler) have exactly 2 output ports', () => {
      for (const type of ['nous.condition.loop', 'nous.condition.error-handler']) {
        const entry = getRegistryEntry(type)
        const outputPorts = entry.ports.filter((p) => p.direction === 'output')
        expect(outputPorts).toHaveLength(2)
      }
    })

    it('pfc-gate has multi: true on output port', () => {
      const entry = getRegistryEntry('nous.governance.pfc-gate')
      const outputPorts = entry.ports.filter((p) => p.direction === 'output')
      expect(outputPorts.some((p) => p.multi === true)).toBe(true)
    })
  })
})
