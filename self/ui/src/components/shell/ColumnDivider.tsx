'use client'

import * as React from 'react'
import { clsx } from 'clsx'

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
      className={clsx('nous-column-divider', className)}
      data-state={isDragging ? 'dragging' : isHovered ? 'hover' : 'idle'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={(event) => {
        event.preventDefault()
        setIsDragging(true)
        setIsHovered(true)

        const pointerId = event.pointerId
        const startAxis = isVertical ? event.clientX : event.clientY
        let lastAxis = startAxis
        const body = document.body
        const previousCursor = body.style.cursor
        const previousUserSelect = body.style.userSelect
        body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
        body.style.userSelect = 'none'
        event.currentTarget.setPointerCapture?.(pointerId)

        const handleMove = (moveEvent: PointerEvent) => {
          const nextAxis = isVertical ? moveEvent.clientX : moveEvent.clientY
          const delta = nextAxis - lastAxis

          if (!Number.isFinite(delta)) {
            return
          }

          lastAxis = nextAxis
          onResize(delta)
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
        position: 'absolute',
        userSelect: 'none',
        insetBlock: 0,
        width: isVertical ? 5 : '90%',
        height: isVertical ? '90%' : 5,
        display: 'flex',
        alignItems: isVertical ? 'stretch' : 'center',
        justifyContent: isVertical ? 'center' : 'stretch',
        background: 'transparent',
        cursor: 'grab',
        touchAction: 'none',
        top: isVertical ? '50%' : undefined,
        left: !isVertical ? '50%' : undefined,
        transform: isVertical ? 'translateY(-50%)' : 'translateX(-50%)',
        ...style,
      }}
      {...props}
    >
      <div style={{
        width: isVertical ? 1 : '100%',
        height: isVertical ? '100%' : 1,
        background: isDragging || isHovered ? 'var(--nous-border-strong)' : 'transparent',
        transition: 'background var(--nous-duration-fast) var(--nous-ease-out)',
      }} />
    </div>
  )
}
