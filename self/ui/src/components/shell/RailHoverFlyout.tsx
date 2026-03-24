'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import type { FlyoutItem } from './types'

const FLYOUT_CLOSE_DELAY_MS = 100

function readPixelToken(tokenName: string, fallback: number): number {
  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(tokenName)
    .trim()
  const parsedValue = Number.parseFloat(rawValue)

  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

export interface RailHoverFlyoutProps
  extends React.HTMLAttributes<HTMLDivElement> {
  items: FlyoutItem[]
  anchorEl: HTMLElement | null
  onItemClick: (id: string) => void
  onClose: () => void
}

export function RailHoverFlyout({
  items,
  anchorEl,
  onItemClick,
  onClose,
  className,
  style,
  ...props
}: RailHoverFlyoutProps) {
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(
    null,
  )
  const closeTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!anchorEl) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect()
      const offset = readPixelToken('--nous-space-sm', 8)

      setPosition({
        left: rect.right + offset,
        top: rect.top,
      })
    }

    const cancelClose = () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }

    const scheduleClose = () => {
      cancelClose()
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null
        onClose()
      }, FLYOUT_CLOSE_DELAY_MS)
    }

    updatePosition()
    anchorEl.addEventListener('mouseenter', cancelClose)
    anchorEl.addEventListener('mouseleave', scheduleClose)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      anchorEl.removeEventListener('mouseenter', cancelClose)
      anchorEl.removeEventListener('mouseleave', scheduleClose)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      cancelClose()
    }
  }, [anchorEl, onClose])

  if (!anchorEl || !position) {
    return null
  }

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      onClose()
    }, FLYOUT_CLOSE_DELAY_MS)
  }

  return createPortal(
    <div
      className={clsx('nous-rail-hover-flyout', className)}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: `${position.left}px`,
        top: `${position.top}px`,
        minWidth: 'calc(var(--nous-chat-column-width) - var(--nous-space-4xl))',
        maxWidth: 'var(--nous-chat-column-width)',
        borderRadius: 'var(--nous-radius-lg)',
        border: '1px solid var(--nous-shell-column-border)',
        background: 'var(--nous-catalog-card-bg)',
        color: 'var(--nous-text-primary)',
        backdropFilter: 'blur(var(--nous-blur-md))',
        boxShadow: 'var(--nous-shadow-md)',
        padding: 'var(--nous-space-sm)',
        gap: 'var(--nous-space-xs)',
        zIndex: 'var(--nous-z-dropdown)',
        ...style,
      }}
      {...props}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            onItemClick(item.id)
            onClose()
          }}
          style={{
            display: 'flex',
            minWidth: 0,
            alignItems: 'flex-start',
            textAlign: 'left',
            width: '100%',
            border: 'none',
            borderRadius: 'var(--nous-radius-md)',
            background: 'transparent',
            color: 'inherit',
            padding: 'var(--nous-space-sm)',
            cursor: 'pointer',
            transition: 'var(--nous-hover-button-transition)',
            gap: 'var(--nous-space-sm)',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.icon ?? '•'}
          </span>
          <span
            style={{
              display: 'flex',
              minWidth: 0,
              flex: '1 1 0%',
              flexDirection: 'column',
            }}
          >
            <span
              style={{
                fontSize: 'var(--nous-font-size-sm)',
                fontWeight: 'var(--nous-font-weight-medium)',
                color: 'var(--nous-text-primary)',
              }}
            >
              {item.label}
            </span>
            {item.description ? (
              <span
                style={{
                  marginTop: 'var(--nous-space-xs)',
                  fontSize: 'var(--nous-font-size-xs)',
                  color: 'var(--nous-text-secondary)',
                }}
              >
                {item.description}
              </span>
            ) : null}
            {item.timestamp ? (
              <span
                style={{
                  marginTop: 'var(--nous-space-xs)',
                  fontSize: 'var(--nous-font-size-xs)',
                  color: 'var(--nous-text-tertiary)',
                }}
              >
                {new Date(item.timestamp).toLocaleString()}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  )
}
