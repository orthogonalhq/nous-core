'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatStage, ChatStageManagerReturn } from './types'

/** Idle timer: ambient_large -> ambient_small after turn complete */
const IDLE_AMBIENT_LARGE_TO_SMALL = 5_000
/** Idle timer: ambient_small -> small after turn complete */
const IDLE_AMBIENT_SMALL_TO_SMALL = 3_000

/**
 * Manages the 4-state chat stage state machine for SimpleShellLayout.
 *
 * States: small | ambient_small | ambient_large | full
 *
 * This hook is transport-agnostic — it exposes signal methods that the
 * app layer calls when SSE events fire. The hook handles all state
 * transitions and idle timers internally.
 */
export function useChatStageManager(): ChatStageManagerReturn {
  const [chatStage, setChatStage] = useState<ChatStage>('small')
  const [isPinned, setIsPinned] = useState(false)
  const isActiveTurnRef = useRef(false)

  // Idle timer refs
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (secondaryTimerRef.current) {
      clearTimeout(secondaryTimerRef.current)
      secondaryTimerRef.current = null
    }
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [clearAllTimers])

  const signalSending = useCallback(() => {
    clearAllTimers()
    isActiveTurnRef.current = true
    setChatStage((prev) => {
      if (prev === 'small') return 'ambient_small'
      return prev
    })
  }, [clearAllTimers])

  const signalInferenceStart = useCallback(() => {
    clearAllTimers()
    isActiveTurnRef.current = true
    setChatStage((prev) => {
      if (prev === 'small') return 'ambient_small'
      return prev
    })
  }, [clearAllTimers])

  const signalPfcDecision = useCallback(() => {
    setChatStage((prev) => {
      if (prev === 'ambient_small') return 'ambient_large'
      return prev
    })
  }, [])

  const signalTurnComplete = useCallback(() => {
    isActiveTurnRef.current = false
    setChatStage((prev) => {
      if (prev === 'ambient_large') {
        // ambient_large -> ambient_small after 5s, then ambient_small -> small after 3s
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null
          setChatStage((current) => {
            if (current === 'ambient_large') {
              secondaryTimerRef.current = setTimeout(() => {
                secondaryTimerRef.current = null
                setChatStage((c) => (c === 'ambient_small' ? 'small' : c))
              }, IDLE_AMBIENT_SMALL_TO_SMALL)
              return 'ambient_small'
            }
            return current
          })
        }, IDLE_AMBIENT_LARGE_TO_SMALL)
        return prev
      }
      if (prev === 'ambient_small') {
        idleTimerRef.current = setTimeout(() => {
          idleTimerRef.current = null
          setChatStage((current) => (current === 'ambient_small' ? 'small' : current))
        }, IDLE_AMBIENT_SMALL_TO_SMALL)
        return prev
      }
      // full persists — no idle decay
      return prev
    })
  }, [])

  const expandToAmbientLarge = useCallback(() => {
    clearAllTimers()
    setChatStage('ambient_large')
  }, [clearAllTimers])

  const expandToFull = useCallback(() => {
    clearAllTimers()
    setChatStage('full')
  }, [clearAllTimers])

  const collapseToAmbientSmall = useCallback(() => {
    clearAllTimers()
    setChatStage('ambient_small')
  }, [clearAllTimers])

  const minimizeToAmbientLarge = useCallback(() => {
    clearAllTimers()
    setChatStage('ambient_large')
  }, [clearAllTimers])

  const collapseToSmall = useCallback(() => {
    clearAllTimers()
    setChatStage('small')
  }, [clearAllTimers])

  const handleClickOutside = useCallback(() => {
    setChatStage((prev) => {
      // If pinned and in full mode, ignore click-outside
      if (isPinned && prev === 'full') return prev
      if (prev !== 'small') {
        clearAllTimers()
        // If agent is actively working, collapse to ambient_small (not small)
        // so the user can still see the thinking indicator
        if (isActiveTurnRef.current) return 'ambient_small'
        return 'small'
      }
      return prev
    })
  }, [clearAllTimers, isPinned])

  const togglePin = useCallback(() => {
    setIsPinned((prev) => !prev)
  }, [])

  const signalInputFocus = useCallback(() => {
    clearAllTimers()
    setChatStage((prev) => {
      if (prev !== 'full') return 'full'
      return prev
    })
  }, [clearAllTimers])

  return {
    chatStage,
    isPinned,
    signalSending,
    signalInferenceStart,
    signalPfcDecision,
    signalTurnComplete,
    expandToAmbientLarge,
    expandToFull,
    collapseToAmbientSmall,
    minimizeToAmbientLarge,
    collapseToSmall,
    handleClickOutside,
    togglePin,
    signalInputFocus,
  }
}
