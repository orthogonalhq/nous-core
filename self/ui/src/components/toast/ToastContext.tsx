'use client'

import { createContext, useCallback, useContext, useRef, useState, type PropsWithChildren } from 'react'

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

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const now = Date.now()

      // Dedup: ignore duplicate id within 60s window
      const lastSeen = recentIds.current.get(id)
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
        return
      }
      recentIds.current.set(id, now)

      const entry: ToastEntry = {
        id,
        message: options.message,
        severity: options.severity,
        dismissible: options.dismissible ?? true,
        durationMs: options.durationMs === undefined ? DEFAULT_DURATION_MS : options.durationMs,
        createdAt: now,
      }

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
          dismissToast(id)
        }, entry.durationMs)
        timers.current.set(id, timer)
      }
    },
    [dismissToast],
  )

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  )
}
