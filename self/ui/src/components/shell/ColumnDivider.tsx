'use client'

import * as React from 'react'
import { cn } from '../../lib/cn'

export interface ColumnDividerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  onResize: (delta: number) => void
  orientation?: 'vertical' | 'horizontal'
}

export function ColumnDivider({
  onResize,
  orientation = 'vertical',
  className,
  style,
  ...props
}: ColumnDividerProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [isHovered, setIsHovered] = React.useState(false)
  const cleanupRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const isVertical = orientation === 'vertical'

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'nous-column-divider absolute select-none',
        className,
      )}
      data-state={isDragging ? 'dragging' : isHovered ? 'hover' : 'idle'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={(event) => {
        event.preventDefault()
        setIsDragging(true)
        setIsHovered(true)

        const pointerId = event.pointerId
        const startAxis = isVertical ? event.clientX : event.clientY
        const body = document.body
        const previousCursor = body.style.cursor
        const previousUserSelect = body.style.userSelect
        body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
        body.style.userSelect = 'none'
        event.currentTarget.setPointerCapture?.(pointerId)

        const handleMove = (moveEvent: PointerEvent) => {
          const nextAxis = isVertical ? moveEvent.clientX : moveEvent.clientY
          onResize(nextAxis - startAxis)
        }

        const cleanup = () => {
          document.removeEventListener('pointermove', handleMove)
          document.removeEventListener('pointerup', handleUp)
          body.style.cursor = previousCursor
          body.style.userSelect = previousUserSelect
          setIsDragging(false)
          cleanupRef.current = null
        }

        const handleUp = () => {
          cleanup()
        }

        cleanupRef.current = cleanup
        document.addEventListener('pointermove', handleMove)
        document.addEventListener('pointerup', handleUp)
      }}
      style={{
        insetBlock: 0,
        width: isVertical ? 'var(--nous-column-divider-width)' : '100%',
        height: isVertical ? '100%' : 'var(--nous-column-divider-width)',
        background: isDragging || isHovered
          ? 'var(--nous-accent)'
          : 'var(--nous-shell-column-border)',
        cursor: isVertical ? 'col-resize' : 'row-resize',
        touchAction: 'none',
        transition: 'background var(--nous-duration-fast) var(--nous-ease-out)',
        ...style,
      }}
      {...props}
    />
  )
}
