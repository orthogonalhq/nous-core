'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { FloatingPanelState, FloatingPanelPosition } from '../../../types/workflow-builder'

// ─── Options and return type ──────────────────────────────────────────────────

export interface UseFloatingPanelOptions {
  /** Initial position preset or coordinates. */
  initialPosition: FloatingPanelPosition
  /** Default collapsed state. */
  defaultCollapsed?: boolean
  /** Reference to the canvas wrapper element for boundary clamping. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

export interface UseFloatingPanelReturn {
  state: FloatingPanelState
  /** Ref to attach to the panel container element for boundary clamping. */
  panelRef: React.RefObject<HTMLDivElement | null>
  onCollapse: () => void
  onPin: () => void
  onClose: () => void
  onShow: () => void
  onDragStart: (e: React.MouseEvent) => void
  onDrag: (e: MouseEvent) => void
  onDragEnd: () => void
}

// ─── Position resolution ──────────────────────────────────────────────────────

const PANEL_PADDING = 12

function resolveInitialPosition(
  position: FloatingPanelPosition,
): { x: number; y: number } {
  if (position === 'left') return { x: PANEL_PADDING, y: PANEL_PADDING }
  if (position === 'right') {
    // Right preset resolved at mount time when container dimensions are known.
    return { x: PANEL_PADDING, y: PANEL_PADDING }
  }
  return position
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFloatingPanel(options: UseFloatingPanelOptions): UseFloatingPanelReturn {
  const { initialPosition, defaultCollapsed = false, containerRef } = options

  const [state, setState] = useState<FloatingPanelState>(() => {
    const pos = resolveInitialPosition(initialPosition)
    return {
      x: pos.x,
      y: pos.y,
      collapsed: defaultCollapsed,
      pinned: false,
      visible: true,
    }
  })

  // Track drag offset from pointer to panel top-left corner
  const dragOffset = useRef({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Resolve 'right' position once container is available
  useEffect(() => {
    if (initialPosition !== 'right') return
    const container = containerRef.current
    if (!container) return
    const panelEl = panelRef.current
    const panelWidth = panelEl ? panelEl.offsetWidth : 260
    const rect = container.getBoundingClientRect()
    setState((prev) => ({
      ...prev,
      x: Math.max(0, rect.width - panelWidth - PANEL_PADDING),
      y: PANEL_PADDING,
    }))
  }, [initialPosition, containerRef])

  const onCollapse = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }))
  }, [])

  const onPin = useCallback(() => {
    setState((prev) => ({ ...prev, pinned: !prev.pinned }))
  }, [])

  const onClose = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }))
  }, [])

  const onShow = useCallback(() => {
    setState((prev) => ({ ...prev, visible: true }))
  }, [])

  const onDrag = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return
      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      let newX = e.clientX - containerRect.left - dragOffset.current.x
      let newY = e.clientY - containerRect.top - dragOffset.current.y

      // Boundary clamping — keep panel within container
      const panelEl = panelRef.current
      const panelWidth = panelEl ? panelEl.offsetWidth : 260
      const panelHeight = panelEl ? panelEl.offsetHeight : 200

      newX = Math.max(0, Math.min(newX, containerRect.width - panelWidth))
      newY = Math.max(0, Math.min(newY, containerRect.height - panelHeight))

      setState((prev) => ({ ...prev, x: newX, y: newY }))
    },
    [containerRef],
  )

  const onDragEnd = useCallback(() => {
    isDragging.current = false
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', onDragEnd)
  }, [onDrag])

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (state.pinned) return

      e.preventDefault()
      isDragging.current = true

      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      dragOffset.current = {
        x: e.clientX - containerRect.left - state.x,
        y: e.clientY - containerRect.top - state.y,
      }

      document.addEventListener('mousemove', onDrag)
      document.addEventListener('mouseup', onDragEnd)
    },
    [state.pinned, state.x, state.y, containerRef, onDrag, onDragEnd],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onDrag)
      document.removeEventListener('mouseup', onDragEnd)
    }
  }, [onDrag, onDragEnd])

  return {
    state,
    panelRef,
    onCollapse,
    onPin,
    onClose,
    onShow,
    onDragStart,
    onDrag,
    onDragEnd,
  }
}
