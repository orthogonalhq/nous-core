'use client'

import * as React from 'react'
import { cn } from '../../lib/cn'
import { ColumnDivider } from './ColumnDivider'
import type { ColumnWidths, ShellBreakpoint } from './types'

const DEFAULT_CHAT_WIDTH = 320
const DEFAULT_OBSERVE_WIDTH = 280
const MIN_CHAT_WIDTH = 280
const MIN_OBSERVE_WIDTH = 240

function clampWidth(width: number, minimum: number): number {
  return Math.max(width, minimum)
}

function readPixelToken(tokenName: string, fallback: number): number {
  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(tokenName)
    .trim()
  const parsedValue = Number.parseFloat(rawValue)

  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

type ShellLayoutStyle = React.CSSProperties & {
  '--shell-chat-width': string
  '--shell-observe-width': string
}

export interface ShellLayoutProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'content'> {
  rail: React.ReactNode
  chat: React.ReactNode
  content: React.ReactNode
  observe: React.ReactNode
  breakpoint?: ShellBreakpoint
  onColumnResize?: (widths: ColumnWidths) => void
  initialWidths?: Partial<ColumnWidths>
}

export function ShellLayout({
  rail,
  chat,
  content,
  observe,
  breakpoint = 'full',
  onColumnResize,
  initialWidths,
  className,
  style,
  ...props
}: ShellLayoutProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [chatWidth, setChatWidth] = React.useState(
    clampWidth(initialWidths?.chat ?? DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH),
  )
  const [observeWidth, setObserveWidth] = React.useState(
    clampWidth(initialWidths?.observe ?? DEFAULT_OBSERVE_WIDTH, MIN_OBSERVE_WIDTH),
  )

  const emitResize = (nextChatWidth: number, nextObserveWidth: number) => {
    if (!onColumnResize) {
      return
    }

    const shellWidth =
      containerRef.current?.getBoundingClientRect().width ??
      nextChatWidth + nextObserveWidth
    const railWidth = readPixelToken('--nous-rail-width', 72)
    const contentWidth = Math.max(
      shellWidth - railWidth - nextChatWidth - nextObserveWidth,
      0,
    )

    onColumnResize({
      chat: nextChatWidth,
      content: contentWidth,
      observe: nextObserveWidth,
    })
  }

  const applyChatResize = (delta: number) => {
    const nextWidth = clampWidth(chatWidth + delta, MIN_CHAT_WIDTH)
    setChatWidth(nextWidth)
    emitResize(nextWidth, observeWidth)
  }

  const applyObserveResize = (delta: number) => {
    const nextWidth = clampWidth(observeWidth + delta, MIN_OBSERVE_WIDTH)
    setObserveWidth(nextWidth)
    emitResize(chatWidth, nextWidth)
  }

  const showChat = breakpoint !== 'narrow'
  const showObserve = breakpoint === 'full'

  const layoutStyle: ShellLayoutStyle = {
    '--shell-chat-width': `${chatWidth}px`,
    '--shell-observe-width': `${observeWidth}px`,
    display: 'grid',
    gridTemplateAreas: '"rail chat content observe"',
    gridTemplateColumns: [
      'var(--nous-rail-width)',
      showChat ? 'var(--shell-chat-width)' : '0px',
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
      className={cn('nous-shell-layout min-w-0', className)}
      data-breakpoint={breakpoint}
      style={layoutStyle}
      {...props}
    >
      <div
        data-shell-area="rail"
        className="min-w-0 overflow-hidden"
        style={{
          gridArea: 'rail',
          background: 'var(--nous-rail-bg)',
        }}
      >
        {rail}
      </div>

      <div
        data-shell-area="chat"
        className="min-w-0 overflow-hidden"
        style={{
          gridArea: 'chat',
          display: showChat ? 'block' : 'none',
          background: 'var(--nous-bg-surface)',
          borderInlineEnd: showChat ? '1px solid var(--nous-shell-column-border)' : 'none',
        }}
      >
        {chat}
      </div>

      <div
        data-shell-area="content"
        className="min-w-0 overflow-hidden"
        style={{
          gridArea: 'content',
          background: 'var(--nous-content-bg)',
        }}
      >
        {content}
      </div>

      <div
        data-shell-area="observe"
        className="min-w-0 overflow-hidden"
        style={{
          gridArea: 'observe',
          display: showObserve ? 'block' : 'none',
          background: 'var(--nous-observe-bg)',
          borderInlineStart: showObserve ? '1px solid var(--nous-shell-column-border)' : 'none',
        }}
      >
        {observe}
      </div>

      {showChat ? (
        <ColumnDivider
          aria-label="Resize chat column"
          onResize={applyChatResize}
          style={{
            left: 'calc(var(--nous-rail-width) + var(--shell-chat-width))',
            transform: 'translateX(calc(var(--nous-column-divider-width) / -2))',
          }}
        />
      ) : null}

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
