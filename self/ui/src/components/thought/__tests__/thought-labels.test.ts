import { describe, expect, it } from 'vitest'
import {
  getThoughtLabel,
  LIFECYCLE_PHASE_LABELS,
  PFC_THOUGHT_TYPE_LABELS,
} from '../thought-labels'

describe('thought-labels', () => {
  describe('LIFECYCLE_PHASE_LABELS', () => {
    it('contains 7 entries', () => {
      expect(Object.keys(LIFECYCLE_PHASE_LABELS).length).toBe(7)
    })
  })

  describe('PFC_THOUGHT_TYPE_LABELS', () => {
    it('contains 6 entries', () => {
      expect(Object.keys(PFC_THOUGHT_TYPE_LABELS).length).toBe(6)
    })
  })

  describe('getThoughtLabel — phase lookups', () => {
    it('turn-start → Turn Started', () => {
      expect(getThoughtLabel('phase', 'turn-start')).toBe('Turn Started')
    })

    it('opctl-check → Operations Check', () => {
      expect(getThoughtLabel('phase', 'opctl-check')).toBe('Operations Check')
    })

    it('gateway-run → Gateway Execution', () => {
      expect(getThoughtLabel('phase', 'gateway-run')).toBe('Gateway Execution')
    })

    it('response-resolved → Response Resolved', () => {
      expect(getThoughtLabel('phase', 'response-resolved')).toBe('Response Resolved')
    })

    it('stm-finalize → Memory Finalized', () => {
      expect(getThoughtLabel('phase', 'stm-finalize')).toBe('Memory Finalized')
    })

    it('trace-record → Trace Recorded', () => {
      expect(getThoughtLabel('phase', 'trace-record')).toBe('Trace Recorded')
    })

    it('turn-complete → Turn Complete', () => {
      expect(getThoughtLabel('phase', 'turn-complete')).toBe('Turn Complete')
    })

    it('unknown slug falls back to raw slug', () => {
      expect(getThoughtLabel('phase', 'unknown-future-slug')).toBe('unknown-future-slug')
    })
  })

  describe('getThoughtLabel — thoughtType lookups', () => {
    it('confidence-governance → Confidence Check', () => {
      expect(getThoughtLabel('thoughtType', 'confidence-governance')).toBe('Confidence Check')
    })

    it('memory-write → Memory Write', () => {
      expect(getThoughtLabel('thoughtType', 'memory-write')).toBe('Memory Write')
    })

    it('memory-mutation → Memory Update', () => {
      expect(getThoughtLabel('thoughtType', 'memory-mutation')).toBe('Memory Update')
    })

    it('tool-execution → Tool Execution', () => {
      expect(getThoughtLabel('thoughtType', 'tool-execution')).toBe('Tool Execution')
    })

    it('reflection → Reflection', () => {
      expect(getThoughtLabel('thoughtType', 'reflection')).toBe('Reflection')
    })

    it('escalation → Escalation', () => {
      expect(getThoughtLabel('thoughtType', 'escalation')).toBe('Escalation')
    })

    it('unknown slug falls back to raw slug', () => {
      expect(getThoughtLabel('thoughtType', 'unknown-future-slug')).toBe('unknown-future-slug')
    })
  })
})
