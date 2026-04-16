'use client'

import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren } from 'react'
import { trpc, useEventSubscription } from '@nous/transport'

export interface ToastOptions {
  id?: string
  message: string
  severity: 'info' | 'warning' | 'error'
  dismissible?: boolean
  durationMs?: number | null
}

export interface ToastEntry extends Required<Pick<ToastOptions, 'message' | 'severity' | 'dismissible'>> {
  id: string
  createdAt: number
  durationMs: number | null
}

interface ToastContextValue {
  toasts: ToastEntry[]
  showToast: (options: ToastOptions) => void
  dismissToast: (id: string) => void
}

const MAX_VISIBLE = 3
const DEFAULT_DURATION_MS = 8_000
const DEDUP_WINDOW_MS = 60_000

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const recentIds = useRef<Map<string, number>>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const utils = trpc.useUtils()

  const addToastEntry = useCallback((entry: ToastEntry) => {
    setToasts((prev) => {
      const next = [...prev, entry]
      // Cap at MAX_VISIBLE — remove oldest
      while (next.length > MAX_VISIBLE) {
        const removed = next.shift()!
        const timer = timers.current.get(removed.id)
        if (timer) {
          clearTimeout(timer)
          timers.current.delete(removed.id)
        }
      }
      return next
    })

    // Auto-dismiss timer
    if (entry.durationMs !== null) {
      const timer = setTimeout(() => {
        dismissToast(entry.id)
      }, entry.durationMs)
      timers.current.set(entry.id, timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    // Mark dismissed in notification store
    void utils.client.notifications.dismiss.mutate({ id }).catch(() => { /* fire-and-forget */ })
  }, [utils])

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const now = Date.now()

      // Client-side dedup: ignore duplicate id within 60s window (belt-and-suspenders)
      const lastSeen = recentIds.current.get(id)
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
        return
      }
      recentIds.current.set(id, now)

      // Route through tRPC raise mutation — the SSE subscription below renders the toast
      void utils.client.notifications.raise.mutate({
        kind: 'toast',
        projectId: null,
        title: options.message,
        message: options.message,
        transient: true,
        source: 'toast-provider',
        toast: {
          severity: options.severity,
          dismissible: options.dismissible ?? true,
          durationMs: options.durationMs === undefined ? DEFAULT_DURATION_MS : options.durationMs,
        },
      }).catch(() => { /* fire-and-forget */ })
    },
    [utils],
  )

  // Subscribe to notification:raised SSE for toast rendering
  useEventSubscription({
    channels: ['notification:raised'],
    onEvent: (_channel: string, payload: unknown) => {
      const data = payload as { kind: string; id: string }
      if (data.kind !== 'toast') return
      void utils.notifications.get.fetch({ id: data.id }).then((record) => {
        if (!record || record.kind !== 'toast') return
        addToastEntry({
          id: record.id,
          message: record.message,
          severity: record.toast.severity,
          dismissible: record.toast.dismissible,
          durationMs: record.toast.durationMs ?? DEFAULT_DURATION_MS,
          createdAt: Date.now(),
        })
      }).catch(() => { /* SSE fetch failure — non-critical */ })
    },
  })

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  )
}
