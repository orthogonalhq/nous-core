import { describe, expect, it } from 'vitest'
import {
  StatusBarBackpressureSchema,
  StatusBarBudgetSchema,
  StatusBarActiveAgentsSchema,
  StatusBarSnapshotSchema,
  MaoSystemSnapshotInputSchema,
  ModelRoleSchema,
  MODEL_ROLE_LABELS,
} from '@nous/shared'
import { ObserveTabSchema } from '../types'
import { STATUS_BAR_CHANNELS } from '../StatusBar'

/**
 * WR-162 SP 11 (SUPV-SP11-010) — closed-enum admission tests.
 *
 * Read-side regression guards. SP 11 widens NO closed enums; these tests
 * prove the literals SP 11 routes through remain admitted post-SP-2.
 * Mirrors SP 8 / SP 9 / SP 10 UT-CAT* admission discipline.
 */
describe('SP 11 closed-enum admission (read-side regression guards)', () => {
  it('UT-SP11-CAT1 — ObserveTab admits the three SP 11 literals', () => {
    expect(ObserveTabSchema.safeParse('agents').success).toBe(true)
    expect(ObserveTabSchema.safeParse('system-load').success).toBe(true)
    expect(ObserveTabSchema.safeParse('cost-monitor').success).toBe(true)
  })

  it('UT-SP11-CAT2 — StatusBarBackpressure.state admits all three literals', () => {
    for (const lit of ['nominal', 'elevated', 'critical'] as const) {
      expect(
        StatusBarBackpressureSchema.safeParse({ state: lit, queueDepth: 0, activeAgents: 0 })
          .success,
      ).toBe(true)
    }
  })

  it('UT-SP11-CAT3 — StatusBarBudget.state admits all four literals', () => {
    for (const lit of ['nominal', 'warning', 'caution', 'exceeded'] as const) {
      expect(
        StatusBarBudgetSchema.safeParse({
          state: lit,
          spent: 0,
          ceiling: 0,
          period: '2026-04-01',
        }).success,
      ).toBe(true)
    }
  })

  it('UT-SP11-CAT4 — StatusBarActiveAgents.status admits both literals', () => {
    expect(StatusBarActiveAgentsSchema.safeParse({ count: 0, status: 'idle' }).success).toBe(true)
    expect(StatusBarActiveAgentsSchema.safeParse({ count: 1, status: 'active' }).success).toBe(true)
  })

  it('UT-SP11-CAT5 — StatusBarSnapshot accepts null for all four slots (.nullable() posture)', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        backpressure: null,
        cognitiveProfile: null,
        budget: null,
        activeAgents: null,
      }).success,
    ).toBe(true)
  })

  it('UT-SP11-CAT6 — MaoSystemSnapshotInput admits densityMode "D2"', () => {
    expect(MaoSystemSnapshotInputSchema.safeParse({ densityMode: 'D2' }).success).toBe(true)
  })
})

/**
 * WR-162 SP 12 (SUPV-SP12-014) — closed-enum admission tests for SP 12
 * consumers. Read-side regression guards mirroring SP 11 UT-SP11-CAT*
 * discipline. SP 12 widens NO closed enums.
 */
describe('SP 12 closed-enum admission (read-side regression guards)', () => {
  it('UT-SP12-CAT1 — ObserveTab admits the four indicator click-target literals', () => {
    for (const lit of ['agents', 'system-load', 'cost-monitor'] as const) {
      expect(ObserveTabSchema.safeParse(lit).success).toBe(true)
    }
  })

  it('UT-SP12-CAT2 — StatusBarBackpressure.state admits all three SP 12 rendered literals', () => {
    for (const lit of ['nominal', 'elevated', 'critical'] as const) {
      expect(
        StatusBarBackpressureSchema.safeParse({ state: lit, queueDepth: 0, activeAgents: 0 })
          .success,
      ).toBe(true)
    }
  })

  it('UT-SP12-CAT3 — StatusBarBudget.state admits all four SP 12 rendered literals', () => {
    for (const lit of ['nominal', 'warning', 'caution', 'exceeded'] as const) {
      expect(
        StatusBarBudgetSchema.safeParse({
          state: lit,
          spent: 0,
          ceiling: 0,
          period: '2026-04-01',
        }).success,
      ).toBe(true)
    }
  })

  it('UT-SP12-CAT4 — StatusBarActiveAgents.status admits both SP 12 rendered literals', () => {
    for (const lit of ['idle', 'active'] as const) {
      expect(StatusBarActiveAgentsSchema.safeParse({ count: 0, status: lit }).success).toBe(true)
    }
  })

  it('UT-SP12-CAT5 — ModelRole admits the four SP 12 fall-through chain literals', () => {
    for (const lit of ['cortex-chat', 'cortex-system', 'orchestrators', 'workers'] as const) {
      expect(ModelRoleSchema.safeParse(lit).success).toBe(true)
    }
  })

  it('UT-SP12-CAT6 — MODEL_ROLE_LABELS keyset matches the four ModelRole literals', () => {
    const keys = Object.keys(MODEL_ROLE_LABELS).sort()
    expect(keys).toEqual(['cortex-chat', 'cortex-system', 'orchestrators', 'workers'].sort())
  })

  it('UT-SP12-CAT7 — StatusBarSnapshot accepts null for all four slots (.nullable() posture; SP 12 consumer)', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        backpressure: null,
        cognitiveProfile: null,
        budget: null,
        activeAgents: null,
      }).success,
    ).toBe(true)
  })

  it('UT-SP12-CAT8 — STATUS_BAR_CHANNELS contains exactly the 12 SP 12 channel literals', () => {
    expect(STATUS_BAR_CHANNELS.length).toBe(12)
    expect([...STATUS_BAR_CHANNELS].sort()).toEqual(
      [
        'health:backlog-analytics',
        'health:issue',
        'health:gateway-status',
        'mao:projection-changed',
        'mao:control-action',
        'app-health:change',
        'app-health:heartbeat',
        'cost:snapshot',
        'cost:budget-alert',
        'cost:budget-exceeded',
        'cost:event-recorded',
        'supervisor:sentinel-status',
      ].sort(),
    )
  })
})
