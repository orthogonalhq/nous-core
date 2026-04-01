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
  breakpoint = 'full',
  onColumnResize,
  initialWidths,
  className,
  style,
  ...props
}: SimpleShellLayoutProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [chatStage, setChatStage] = React.useState<ChatStage>('ambient')

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

  const sidebarWidthRef = React.useRef(sidebarWidth)
  const observeWidthRef = React.useRef(observeWidth)

  React.useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  React.useEffect(() => {
    observeWidthRef.current = observeWidth
  }, [observeWidth])

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

  // Chat row height based on stage
  const chatRowHeight =
    chatStage === 'full'
      ? '1fr'
      : chatStage === 'peek'
        ? 'minmax(200px, 45%)'
        : 'auto'

  // Main row shrinks to 0 when chat is full
  const mainRowHeight = chatStage === 'full' ? '0fr' : '1fr'

  const layoutStyle: SimpleShellStyle = {
    '--shell-sidebar-width': `${effectiveSidebarWidth}px`,
    '--shell-observe-width': `${observeWidth}px`,
    display: 'grid',
    minWidth: 0,
    gridTemplateAreas: [
      '"rail    sidebar content observe"',
      '"chat    chat    content observe"',
    ].join(' '),
    gridTemplateColumns: [
      'var(--nous-project-rail-width)',
      'var(--shell-sidebar-width)',
      '1fr',
      showObserve ? 'var(--shell-observe-width)' : '0px',
    ].join(' '),
    gridTemplateRows: `${mainRowHeight} ${chatRowHeight}`,
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
      {...props}
    >
      <div
        data-shell-area="rail"
        style={{
          minWidth: 0,
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

      {/* Chat spans rail + sidebar columns */}
      <div
        data-shell-area="chat"
        style={{
          gridArea: 'chat',
          minWidth: 0,
          overflow: 'hidden',
          background: 'var(--nous-bg-surface)',
          borderTop: '1px solid var(--nous-shell-column-border)',
          borderRight: '1px solid var(--nous-shell-column-border)',
        }}
      >
        {chatSlot({ stage: chatStage, onStageChange: setChatStage })}
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
