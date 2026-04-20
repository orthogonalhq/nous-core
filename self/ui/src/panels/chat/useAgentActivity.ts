import { useState, useRef, useEffect } from 'react'
import { useEventSubscription } from '@nous/transport'

/**
 * Tracks whether the agent is actively processing via SSE events.
 * Uses a 2s idle delay to avoid flicker between rapid events.
 *
 * Only active when `enabled` is true (sidebar mode, non-small stage).
 */
export function useAgentActivity(enabled: boolean) {
  const [agentActive, setAgentActive] = useState(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEventSubscription({
    channels: [
      'thought:turn-lifecycle',
      'inference:stream-start',
      'inference:stream-complete',
      'system:turn-ack',
    ],
    onEvent: (channel, payload) => {
      const p = payload as Record<string, unknown>

      // Activity starts
      if (
        channel === 'inference:stream-start' ||
        (channel === 'thought:turn-lifecycle' && p.phase === 'turn-start') ||
        channel === 'system:turn-ack'
      ) {
        setAgentActive(true)
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current)
          idleTimerRef.current = null
        }
      }

      // Turn complete — authoritative signal, clear immediately
      if (channel === 'thought:turn-lifecycle' && p.phase === 'turn-complete') {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
        setAgentActive(false)
      }

      // Inference stream complete — may fire mid-reasoning, delay to avoid flicker
      if (channel === 'inference:stream-complete') {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => {
          setAgentActive(false)
          idleTimerRef.current = null
        }, 2000)
      }
    },
    enabled,
  })

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [])

  return agentActive
}
