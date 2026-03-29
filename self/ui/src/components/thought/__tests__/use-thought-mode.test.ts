// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  thoughtModeReducer,
  useThoughtMode,
  BUFFER_MAX,
} from '../use-thought-mode'
import type { ThoughtModeState, ThoughtModeAction } from '../use-thought-mode'

// --- Pure reducer tests (Tier 1 — Contract) ---

describe('thoughtModeReducer', () => {
  const collapsed: ThoughtModeState = { mode: 'conversing:collapsed', toggledExpanded: false }
  const expanded: ThoughtModeState = { mode: 'conversing:expanded', toggledExpanded: true }
  const ambient: ThoughtModeState = { mode: 'ambient:open', toggledExpanded: false }
  const ambientWithToggle: ThoughtModeState = { mode: 'ambient:open', toggledExpanded: true }

  describe('FOCUS_INPUT', () => {
    const action: ThoughtModeAction = { type: 'FOCUS_INPUT' }

    it('from ambient:open transitions to conversing:collapsed when toggledExpanded is false', () => {
      const result = thoughtModeReducer(ambient, action)
      expect(result.mode).toBe('conversing:collapsed')
    })

    it('from ambient:open transitions to conversing:expanded when toggledExpanded is true', () => {
      const result = thoughtModeReducer(ambientWithToggle, action)
      expect(result.mode).toBe('conversing:expanded')
    })

    it('from conversing:collapsed is no-op', () => {
      const result = thoughtModeReducer(collapsed, action)
      expect(result).toBe(collapsed)
    })

    it('from conversing:expanded is no-op', () => {
      const result = thoughtModeReducer(expanded, action)
      expect(result).toBe(expanded)
    })
  })

  describe('BLUR_INPUT', () => {
    const action: ThoughtModeAction = { type: 'BLUR_INPUT' }

    it('from conversing:collapsed transitions to ambient:open', () => {
      const result = thoughtModeReducer(collapsed, action)
      expect(result.mode).toBe('ambient:open')
    })

    it('from conversing:expanded transitions to ambient:open', () => {
      const result = thoughtModeReducer(expanded, action)
      expect(result.mode).toBe('ambient:open')
    })

    it('from ambient:open is no-op', () => {
      const result = thoughtModeReducer(ambient, action)
      expect(result).toBe(ambient)
    })
  })

  describe('TOGGLE_EXPAND', () => {
    const action: ThoughtModeAction = { type: 'TOGGLE_EXPAND' }

    it('from conversing:collapsed transitions to conversing:expanded and sets toggledExpanded: true', () => {
      const result = thoughtModeReducer(collapsed, action)
      expect(result.mode).toBe('conversing:expanded')
      expect(result.toggledExpanded).toBe(true)
    })

    it('from conversing:expanded transitions to conversing:collapsed and sets toggledExpanded: false', () => {
      const result = thoughtModeReducer(expanded, action)
      expect(result.mode).toBe('conversing:collapsed')
      expect(result.toggledExpanded).toBe(false)
    })

    it('from ambient:open is no-op', () => {
      const result = thoughtModeReducer(ambient, action)
      expect(result).toBe(ambient)
    })
  })

  describe('SEND_START', () => {
    const action: ThoughtModeAction = { type: 'SEND_START' }

    it('is no-op in all three states', () => {
      expect(thoughtModeReducer(collapsed, action)).toBe(collapsed)
      expect(thoughtModeReducer(expanded, action)).toBe(expanded)
      expect(thoughtModeReducer(ambient, action)).toBe(ambient)
    })
  })

  describe('SEND_END', () => {
    const action: ThoughtModeAction = { type: 'SEND_END' }

    it('is no-op in all three states', () => {
      expect(thoughtModeReducer(collapsed, action)).toBe(collapsed)
      expect(thoughtModeReducer(expanded, action)).toBe(expanded)
      expect(thoughtModeReducer(ambient, action)).toBe(ambient)
    })
  })

  describe('edge cases', () => {
    it('rapid FOCUS_INPUT/BLUR_INPUT cycling produces deterministic state', () => {
      let state: ThoughtModeState = ambient
      for (let i = 0; i < 100; i++) {
        state = thoughtModeReducer(state, { type: 'FOCUS_INPUT' })
        state = thoughtModeReducer(state, { type: 'BLUR_INPUT' })
      }
      // Should end in ambient:open after blur
      expect(state.mode).toBe('ambient:open')
    })

    it('TOGGLE_EXPAND during rapid focus/blur does not produce invalid state', () => {
      let state: ThoughtModeState = ambient
      state = thoughtModeReducer(state, { type: 'FOCUS_INPUT' })
      expect(state.mode).toBe('conversing:collapsed')
      state = thoughtModeReducer(state, { type: 'TOGGLE_EXPAND' })
      expect(state.mode).toBe('conversing:expanded')
      state = thoughtModeReducer(state, { type: 'BLUR_INPUT' })
      expect(state.mode).toBe('ambient:open')
      state = thoughtModeReducer(state, { type: 'FOCUS_INPUT' })
      // toggledExpanded was set true by TOGGLE_EXPAND, so should return to expanded
      expect(state.mode).toBe('conversing:expanded')
    })
  })
})

// --- Hook tests (Tier 1 — Contract) ---

describe('useThoughtMode', () => {
  it('initializes to conversing:collapsed when detailsAlwaysOn is false', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: false, sending: false }),
    )
    expect(result.current.mode).toBe('conversing:collapsed')
    expect(result.current.isExpanded).toBe(false)
    expect(result.current.isAmbient).toBe(false)
  })

  it('initializes to conversing:expanded when detailsAlwaysOn is true', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: true, sending: false }),
    )
    expect(result.current.mode).toBe('conversing:expanded')
    expect(result.current.isExpanded).toBe(true)
    expect(result.current.isAmbient).toBe(false)
  })

  it('derived isExpanded is true for conversing:expanded', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: true, sending: false }),
    )
    expect(result.current.isExpanded).toBe(true)
  })

  it('derived isExpanded is true for ambient:open', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: false, sending: false }),
    )
    // Transition to ambient:open
    act(() => {
      result.current.dispatch({ type: 'BLUR_INPUT' })
    })
    expect(result.current.mode).toBe('ambient:open')
    expect(result.current.isExpanded).toBe(true)
  })

  it('derived isExpanded is false for conversing:collapsed', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: false, sending: false }),
    )
    expect(result.current.isExpanded).toBe(false)
  })

  it('derived isAmbient is true only for ambient:open', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: false, sending: false }),
    )
    expect(result.current.isAmbient).toBe(false)
    act(() => {
      result.current.dispatch({ type: 'BLUR_INPUT' })
    })
    expect(result.current.isAmbient).toBe(true)
    act(() => {
      result.current.dispatch({ type: 'FOCUS_INPUT' })
    })
    expect(result.current.isAmbient).toBe(false)
  })

  it('dispatch transitions state correctly', () => {
    const { result } = renderHook(() =>
      useThoughtMode({ detailsAlwaysOn: false, sending: false }),
    )
    expect(result.current.mode).toBe('conversing:collapsed')

    act(() => {
      result.current.dispatch({ type: 'TOGGLE_EXPAND' })
    })
    expect(result.current.mode).toBe('conversing:expanded')

    act(() => {
      result.current.dispatch({ type: 'BLUR_INPUT' })
    })
    expect(result.current.mode).toBe('ambient:open')

    act(() => {
      result.current.dispatch({ type: 'FOCUS_INPUT' })
    })
    // toggledExpanded was set true by TOGGLE_EXPAND
    expect(result.current.mode).toBe('conversing:expanded')
  })
})

// --- Constants ---

describe('BUFFER_MAX', () => {
  it('equals 50', () => {
    expect(BUFFER_MAX).toBe(50)
  })
})
