'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatStage, ChatStageManagerReturn } from './types'

/** Idle timer: large -> small after turn complete */
const IDLE_LARGE_TO_SMALL = 4_000

/**
 * Manages the 3-state chat stage state machine for SimpleShellLayout.
 *
 * States: small | large | full
 *
 * This hook is transport-agnostic — it exposes signal methods that the
 * app layer calls when SSE events fire. The hook handles all state
 * transitions and idle timers internally.
 */
export function useChatStageManager(): ChatStageManagerReturn {
  const [chatStage, setChatStage] = useState<ChatStage>('small')

  // Idle timer ref
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [clearAllTimers])

  const signalSending = useCallback(() => {
    clearAllTimers()
    setChatStage((prev) => {
      if (prev === 'small') return 'large'
      return prev
    })
  }, [clearAllTimers])

  const signalInferenceStart = useCallback(() => {
    clearAllTimers()
    setChatStage((prev) => {
      if (prev === 'small') return 'large'
      return prev
    })
  }, [clearAllTimers])

  const signalTurnComplete = useCallback(() => {
    setChatStage((prev) => {
      // Only start idle timer for large state — user-initiated full persists
      if (prev === 'large') {
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null
          setChatStage((current) => (current === 'large' ? 'small' : current))
        }, IDLE_LARGE_TO_SMALL)
        return prev
      }
      return prev
    })
  }, [])

  const expandToLarge = useCallback(() => {
    clearAllTimers()
    setChatStage('large')
  }, [clearAllTimers])

  const expandToFull = useCallback(() => {
    clearAllTimers()
    setChatStage('full')
  }, [clearAllTimers])

  const minimizeToLarge = useCallback(() => {
    clearAllTimers()
    setChatStage('large')
  }, [clearAllTimers])

  const collapseToSmall = useCallback(() => {
    clearAllTimers()
    setChatStage('small')
  }, [clearAllTimers])

  const handleClickOutside = useCallback(() => {
    setChatStage((prev) => {
      if (prev !== 'small') {
        clearAllTimers()
        return 'small'
      }
      return prev
    })
  }, [clearAllTimers])

  return {
    chatStage,
    signalSending,
    signalInferenceStart,
    signalTurnComplete,
    expandToLarge,
    expandToFull,
    minimizeToLarge,
    collapseToSmall,
    handleClickOutside,
  }
}
