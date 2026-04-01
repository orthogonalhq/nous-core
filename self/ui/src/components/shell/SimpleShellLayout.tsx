'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { ColumnDivider } from './ColumnDivider'
import { CollapsibleObserveEdge } from './CollapsibleObserveEdge'
import type { ChatStage, ShellBreakpoint, SimpleShellLayoutProps } from './types'

const DEFAULT_SIDEBAR_WIDTH = 320
const DEFAULT_OBSERVE_WIDTH = 20
const MIN_SIDEBAR_WIDTH = 240
const MIN_OBSERVE_WIDTH = 20
const MAX_SIDEBAR_WIDTH = 480
const MAX_OBSERVE_WIDTH = 400
const COLLAPSED_THRESHOLD = 60

const CHAT_SMALL_HEIGHT = 60

/** Sidebar width caps per breakpoint */
const BREAKPOINT_SIDEBAR: Record<ShellBreakpoint, number> = {
  full: DEFAULT_SIDEBAR_WIDTH,
  medium: 280,
  narrow: 240,
}

function clampWidth(width: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(width, minimum), maximum)
}

type SimpleShellStyle = React.CSSProperties & {
  '--shell-sidebar-width': string
  '--shell-observe-width': string
}

export function SimpleShellLayout({
  projectRail,
  sidebar,
  content,
  observe,
  chatSlot,
  chatStage: chatStageProp,
  onClickOutside,
  breakpoint = 'full',
  onColumnResize,
  initialWidths,
  className,
  style,
  ...props
}: SimpleShellLayoutProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chatOverlayRef = React.useRef<HTMLDivElement | null>(null)
  // Use prop if provided, otherwise fallback to internal state (backwards compat)
  const [internalStage, setInternalStage] = React.useState<ChatStage>('small')
  const chatStage = chatStageProp ?? internalStage
  const internalSetChatStage = chatStageProp !== undefined ? undefined : setInternalStage

  const [sidebarWidth, setSidebarWidth] = React.useState(
    clampWidth(
      initialWidths?.sidebar ?? DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    ),
  )
  const [observeWidth, setObserveWidth] = React.useState(
    clampWidth(
      initialWidths?.observe ?? DEFAULT_OBSERVE_WIDTH,
      MIN_OBSERVE_WIDTH,
      MAX_OBSERVE_WIDTH,
    ),
  )

  // Track container height for overlay size calculations
  const [containerHeight, setContainerHeight] = React.useState(0)

  const sidebarWidthRef = React.useRef(sidebarWidth)
  const observeWidthRef = React.useRef(observeWidth)

  React.useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  React.useEffect(() => {
    observeWidthRef.current = observeWidth
  }, [observeWidth])

  // ResizeObserver to track container height
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const applySidebarResize = React.useCallback((delta: number) => {
    const nextWidth = clampWidth(sidebarWidthRef.current + delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
    sidebarWidthRef.current = nextWidth
    setSidebarWidth(nextWidth)
    onColumnResize?.({ sidebar: nextWidth, observe: observeWidthRef.current })
  }, [onColumnResize])

  const applyObserveResize = React.useCallback((delta: number) => {
    const nextWidth = clampWidth(observeWidthRef.current + delta, MIN_OBSERVE_WIDTH, MAX_OBSERVE_WIDTH)
    observeWidthRef.current = nextWidth
    setObserveWidth(nextWidth)
    onColumnResize?.({ sidebar: sidebarWidthRef.current, observe: nextWidth })
  }, [onColumnResize])

  /** Snap observe to expanded width — called by CollapsibleObserveEdge */
  const handleObserveExpandToggle = React.useCallback(() => {
    const EXPANDED_WIDTH = 280
    const next = observeWidthRef.current < COLLAPSED_THRESHOLD ? EXPANDED_WIDTH : MIN_OBSERVE_WIDTH
    observeWidthRef.current = next
    setObserveWidth(next)
    onColumnResize?.({ sidebar: sidebarWidthRef.current, observe: next })
  }, [onColumnResize])

  const showObserve = breakpoint === 'full'

  // Cap sidebar width at breakpoint max
  const effectiveSidebarWidth = Math.min(sidebarWidth, BREAKPOINT_SIDEBAR[breakpoint])

  // Compute chat overlay height based on stage
  const chatOverlayHeight = (() => {
    switch (chatStage) {
      case 'small': return CHAT_SMALL_HEIGHT
      case 'large': return Math.max(200, Math.round(containerHeight * 0.5))
      case 'full': return containerHeight || '100%'
      default: return CHAT_SMALL_HEIGHT
    }
  })()

  // Click-outside handler — single handler on the layout container
  const handleLayoutClick = React.useCallback((e: React.MouseEvent) => {
    if (chatStage === 'small' || !onClickOutside) return
    // Check if click target is inside the chat overlay
    if (chatOverlayRef.current?.contains(e.target as Node)) return
    onClickOutside()
  }, [chatStage, onClickOutside])

  const layoutStyle: SimpleShellStyle = {
    '--shell-sidebar-width': `${effectiveSidebarWidth}px`,
    '--shell-observe-width': `${observeWidth}px`,
    display: 'grid',
    minWidth: 0,
    gridTemplateAreas: '"rail sidebar content observe"',
    gridTemplateColumns: [
      'var(--nous-project-rail-width)',
      'var(--shell-sidebar-width)',
      '1fr',
      showObserve ? 'var(--shell-observe-width)' : '0px',
    ].join(' '),
    gridTemplateRows: '1fr',
    position: 'relative',
    width: '100%',
    height: '100%',
    background: 'var(--nous-bg-base)',
    ...style,
  }

  return (
    <div
      ref={containerRef}
      className={clsx('nous-simple-shell-layout', className)}
      data-breakpoint={breakpoint}
      style={layoutStyle}
      onClick={handleLayoutClick}
      {...props}
    >
      <div
        data-shell-area="rail"
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          gridArea: 'rail',
          background: 'var(--nous-rail-bg)',
        }}
      >
        {projectRail}
      </div>

      <div
        data-shell-area="sidebar"
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          gridArea: 'sidebar',
          background: 'var(--nous-bg-surface)',
          borderInlineEnd: '1px solid var(--nous-shell-column-border)',
        }}
      >
        {sidebar}
      </div>

      <div
        data-shell-area="content"
        style={{
          minWidth: 0,
          overflowY: 'auto',
          gridArea: 'content',
          background: 'var(--nous-content-bg)',
        }}
      >
        {content}
      </div>

      <div
        data-shell-area="observe"
        style={{
          minWidth: 0,
          overflow: 'hidden',
          gridArea: 'observe',
          display: showObserve ? 'block' : 'none',
          background: 'var(--nous-observe-bg)',
          borderInlineStart: showObserve
            ? '1px solid var(--nous-shell-column-border)'
            : 'none',
        }}
      >
        <CollapsibleObserveEdge
          width={observeWidth}
          onExpandToggle={handleObserveExpandToggle}
        >
          {observe}
        </CollapsibleObserveEdge>
      </div>

      {/* Chat overlay — anchored to bottom of rail+sidebar area */}
      <div
        ref={chatOverlayRef}
        data-shell-area="chat"
        data-chat-stage={chatStage}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: `calc(var(--nous-project-rail-width) + var(--shell-sidebar-width))`,
          height: typeof chatOverlayHeight === 'number' ? `${chatOverlayHeight}px` : chatOverlayHeight,
          zIndex: 10,
          pointerEvents: 'auto',
          background: 'var(--nous-bg-surface)',
          borderTop: '1px solid var(--nous-shell-column-border)',
          borderRight: '1px solid var(--nous-shell-column-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'height 300ms ease',
        }}
      >
        {chatSlot({ stage: chatStage, onStageChange: internalSetChatStage ?? (() => {}) })}
      </div>

      <ColumnDivider
        aria-label="Resize sidebar column"
        onResize={applySidebarResize}
        style={{
          left: 'calc(var(--nous-project-rail-width) + var(--shell-sidebar-width))',
          transform: 'translateX(calc(var(--nous-column-divider-width) / -2))',
        }}
      />

      {showObserve ? (
        <ColumnDivider
          aria-label="Resize observe column"
          onResize={(delta) => applyObserveResize(delta * -1)}
          style={{
            right: 'var(--shell-observe-width)',
            transform: 'translateX(calc(var(--nous-column-divider-width) / 2))',
          }}
        />
      ) : null}
    </div>
  )
}
