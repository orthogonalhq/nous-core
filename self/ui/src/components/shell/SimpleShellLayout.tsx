'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { ColumnDivider } from './ColumnDivider'
import type { ShellBreakpoint, SimpleShellLayoutProps } from './types'

const DEFAULT_SIDEBAR_WIDTH = 320
const DEFAULT_OBSERVE_WIDTH = 20
const MIN_SIDEBAR_WIDTH = 240
const MIN_OBSERVE_WIDTH = 20
const MAX_SIDEBAR_WIDTH = 480
const MAX_OBSERVE_WIDTH = 400

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
  breakpoint = 'full',
  onColumnResize,
  initialWidths,
  className,
  style,
  ...props
}: SimpleShellLayoutProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)

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

  const emitResize = (nextSidebarWidth: number, nextObserveWidth: number) => {
    onColumnResize?.({ sidebar: nextSidebarWidth, observe: nextObserveWidth })
  }

  const applySidebarResize = (delta: number) => {
    const nextWidth = clampWidth(sidebarWidth + delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
    setSidebarWidth(nextWidth)
    emitResize(nextWidth, observeWidth)
  }

  const applyObserveResize = (delta: number) => {
    const nextWidth = clampWidth(observeWidth + delta, MIN_OBSERVE_WIDTH, MAX_OBSERVE_WIDTH)
    setObserveWidth(nextWidth)
    emitResize(sidebarWidth, nextWidth)
  }

  const showObserve = breakpoint === 'full'

  // Cap sidebar width at breakpoint max
  const effectiveSidebarWidth = Math.min(sidebarWidth, BREAKPOINT_SIDEBAR[breakpoint])

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
        {observe}
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
