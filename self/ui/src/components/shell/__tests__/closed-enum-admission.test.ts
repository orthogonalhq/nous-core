import { describe, expect, it } from 'vitest'
import {
  StatusBarBackpressureSchema,
  StatusBarBudgetSchema,
  StatusBarActiveAgentsSchema,
  StatusBarSnapshotSchema,
  MaoSystemSnapshotInputSchema,
} from '@nous/shared'
import { ObserveTabSchema } from '../types'

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
