'use client'

import { useReducer, useMemo } from 'react'

/** Maximum number of thought events retained in the ring buffer. */
export const BUFFER_MAX = 50

export type ThoughtMode =
  | 'conversing:collapsed'
  | 'conversing:expanded'
  | 'ambient:open'

export type ThoughtModeAction =
  | { type: 'FOCUS_INPUT' }
  | { type: 'BLUR_INPUT' }
  | { type: 'TOGGLE_EXPAND' }
  | { type: 'SEND_START' }
  | { type: 'SEND_END' }

export interface ThoughtModeState {
  mode: ThoughtMode
  toggledExpanded: boolean
}

export function thoughtModeReducer(
  state: ThoughtModeState,
  action: ThoughtModeAction,
): ThoughtModeState {
  switch (action.type) {
    case 'FOCUS_INPUT':
      if (state.mode === 'ambient:open') {
        return {
          ...state,
          mode: state.toggledExpanded
            ? 'conversing:expanded'
            : 'conversing:collapsed',
        }
      }
      return state

    case 'BLUR_INPUT':
      if (state.mode.startsWith('conversing:')) {
        return { ...state, mode: 'ambient:open' }
      }
      return state

    case 'TOGGLE_EXPAND':
      if (state.mode === 'conversing:collapsed') {
        return { ...state, mode: 'conversing:expanded', toggledExpanded: true }
      }
      if (state.mode === 'conversing:expanded') {
        return { ...state, mode: 'conversing:collapsed', toggledExpanded: false }
      }
      return state

    case 'SEND_START':
      return state

    case 'SEND_END':
      return state
  }
}

export interface UseThoughtModeOptions {
  detailsAlwaysOn: boolean
  sending: boolean
}

export interface UseThoughtModeReturn {
  mode: ThoughtMode
  dispatch: React.Dispatch<ThoughtModeAction>
  isExpanded: boolean
  isAmbient: boolean
}

export function useThoughtMode(
  options: UseThoughtModeOptions,
): UseThoughtModeReturn {
  const { detailsAlwaysOn } = options

  const [state, dispatch] = useReducer(thoughtModeReducer, undefined, () => ({
    mode: (detailsAlwaysOn
      ? 'conversing:expanded'
      : 'conversing:collapsed') as ThoughtMode,
    toggledExpanded: detailsAlwaysOn,
  }))

  const derived = useMemo(
    () => ({
      isExpanded: state.mode !== 'conversing:collapsed',
      isAmbient: state.mode === 'ambient:open',
    }),
    [state.mode],
  )

  return {
    mode: state.mode,
    dispatch,
    ...derived,
  }
}
