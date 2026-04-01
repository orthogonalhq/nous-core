'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatStage, ChatStageManagerReturn } from './types'

/** Idle timer durations (ms) per the ratified state machine */
const IDLE_AMBIENT_SMALL_TO_SMALL = 3_000
const IDLE_AMBIENT_LARGE_TO_AMBIENT_SMALL = 5_000
const IDLE_AMBIENT_LARGE_TO_SMALL = 15_000

/**
 * Manages the 5-state chat stage state machine for SimpleShellLayout.
 *
 * This hook is transport-agnostic — it exposes signal methods that the
 * app layer calls when SSE events fire. The hook handles all state
 * transitions and idle timers internally.
 */
export function useChatStageManager(): ChatStageManagerReturn {
  const [chatStage, setChatStage] = useState<ChatStage>('small')
  const inferenceCountRef = useRef(0)

  // Idle timer refs
  const smallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ambientSmallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fullCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAllTimers = useCallback(() => {
    if (smallTimerRef.current) {
      clearTimeout(smallTimerRef.current)
      smallTimerRef.current = null
    }
    if (ambientSmallTimerRef.current) {
      clearTimeout(ambientSmallTimerRef.current)
      ambientSmallTimerRef.current = null
    }
    if (fullCollapseTimerRef.current) {
      clearTimeout(fullCollapseTimerRef.current)
      fullCollapseTimerRef.current = null
    }
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [clearAllTimers])

  const signalSending = useCallback(() => {
    clearAllTimers()
    inferenceCountRef.current = 0
    setChatStage((prev) => {
      // Only auto-expand from small states
      if (prev === 'small') return 'ambient_small'
      return prev
    })
  }, [clearAllTimers])

  const signalInferenceStart = useCallback(() => {
    clearAllTimers()
    inferenceCountRef.current += 1
    setChatStage((prev) => {
      if (prev === 'small') return 'ambient_small'
      // 2nd inference in same turn -> ambient_large (tool use loop)
      if (prev === 'ambient_small' && inferenceCountRef.current >= 2) return 'ambient_large'
      return prev
    })
  }, [clearAllTimers])

  const signalPfcDecision = useCallback(() => {
    clearAllTimers()
    setChatStage((prev) => {
      if (prev === 'ambient_small') return 'ambient_large'
      return prev
    })
  }, [clearAllTimers])

  const signalTurnComplete = useCallback(() => {
    // Reset inference count for next turn
    inferenceCountRef.current = 0

    setChatStage((prev) => {
      // Only start idle timers for ambient states — user-initiated states persist
      if (prev === 'ambient_large') {
        // ambient_large -> ambient_small after 5s, then small after 5s+3s=8s
        ambientSmallTimerRef.current = setTimeout(() => {
          ambientSmallTimerRef.current = null
          setChatStage((current) => (current === 'ambient_large' ? 'ambient_small' : current))
        }, IDLE_AMBIENT_LARGE_TO_AMBIENT_SMALL)

        // Chain: ambient_small -> small after 5s + 3s = 8s total
        smallTimerRef.current = setTimeout(() => {
          smallTimerRef.current = null
          setChatStage((current) => (current === 'ambient_small' ? 'small' : current))
        }, IDLE_AMBIENT_LARGE_TO_AMBIENT_SMALL + IDLE_AMBIENT_SMALL_TO_SMALL)

        // Full collapse safety net: ambient_large -> small after 15s if no interaction
        fullCollapseTimerRef.current = setTimeout(() => {
          fullCollapseTimerRef.current = null
          setChatStage((current) => {
            if (current === 'ambient_large' || current === 'ambient_small') return 'small'
            return current
          })
        }, IDLE_AMBIENT_LARGE_TO_SMALL)

        return prev
      }

      if (prev === 'ambient_small') {
        smallTimerRef.current = setTimeout(() => {
          smallTimerRef.current = null
          setChatStage((current) => (current === 'ambient_small' ? 'small' : current))
        }, IDLE_AMBIENT_SMALL_TO_SMALL)
        return prev
      }

      return prev
    })
  }, [])

  const expandToPeek = useCallback(() => {
    clearAllTimers()
    setChatStage('peek')
  }, [clearAllTimers])

  const expandToFull = useCallback(() => {
    clearAllTimers()
    setChatStage('full')
  }, [clearAllTimers])

  const minimizeToPeek = useCallback(() => {
    clearAllTimers()
    setChatStage('peek')
  }, [clearAllTimers])

  const collapseToSmall = useCallback(() => {
    clearAllTimers()
    inferenceCountRef.current = 0
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
    signalPfcDecision,
    signalTurnComplete,
    expandToPeek,
    expandToFull,
    minimizeToPeek,
    collapseToSmall,
    handleClickOutside,
  }
}
