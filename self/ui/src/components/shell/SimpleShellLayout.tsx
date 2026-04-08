'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { ColumnDivider } from './ColumnDivider'
import { CollapsibleObserveEdge } from './CollapsibleObserveEdge'
import type { ChatStage, ShellBreakpoint, SimpleShellLayoutProps } from './types'

const DEFAULT_SIDEBAR_WIDTH = 320
const DEFAULT_OBSERVE_WIDTH = 32
const MIN_SIDEBAR_WIDTH = 240
const MIN_OBSERVE_WIDTH = 32
const MAX_SIDEBAR_WIDTH = 480
const MAX_OBSERVE_WIDTH = 400
const COLLAPSED_THRESHOLD = 60

/** Maps chat stage → design-token for overlay height */
export const CHAT_STAGE_HEIGHT: Record<ChatStage, string> = {
    small: 'var(--nous-chat-height-small)',
    ambient_small: 'var(--nous-chat-height-ambient-small)',
    ambient_large: 'var(--nous-chat-height-ambient-large)',
    full: 'var(--nous-chat-height-full)',
}

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

    // Remember the last expanded width so the panel keeps its size when collapsed
    const lastExpandedWidthRef = React.useRef(
        (initialWidths?.observe ?? DEFAULT_OBSERVE_WIDTH) >= COLLAPSED_THRESHOLD
            ? (initialWidths?.observe ?? 280)
            : 280,
    )

    React.useEffect(() => {
        if (observeWidth >= COLLAPSED_THRESHOLD) {
            lastExpandedWidthRef.current = observeWidth
        }
    }, [observeWidth])

    // Track whether a toggle animation is in progress (gates grid transition)
    const [isAnimating, setIsAnimating] = React.useState(false)
    const animationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    /** Snap observe to expanded width — called by CollapsibleObserveEdge */
    const handleObserveExpandToggle = React.useCallback(() => {
        const next = observeWidthRef.current < COLLAPSED_THRESHOLD ? lastExpandedWidthRef.current : MIN_OBSERVE_WIDTH
        observeWidthRef.current = next
        setObserveWidth(next)
        onColumnResize?.({ sidebar: sidebarWidthRef.current, observe: next })
        setIsAnimating(true)
        if (animationTimerRef.current) clearTimeout(animationTimerRef.current)
        animationTimerRef.current = setTimeout(() => setIsAnimating(false), 200)
    }, [onColumnResize])

    const showObserve = breakpoint === 'full'
    const observeExpanded = showObserve && observeWidth >= COLLAPSED_THRESHOLD

    // Cap sidebar width at breakpoint max
    const effectiveSidebarWidth = Math.min(sidebarWidth, BREAKPOINT_SIDEBAR[breakpoint])

    const chatOverlayHeight = CHAT_STAGE_HEIGHT[chatStage]

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
        gridTemplateAreas: '"rail sidebar . content . observe"',
        gridTemplateColumns: [
            'var(--nous-project-rail-width)',
            'var(--shell-sidebar-width)',
            '5px',
            '1fr',
            showObserve ? '5px' : '0px',
            showObserve ? 'var(--shell-observe-width)' : '0px',
        ].join(' '),
        gridTemplateRows: '1fr',
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--nous-bg-base)',
        transition: isAnimating ? 'grid-template-columns var(--nous-duration-normal) var(--nous-ease-out)' : undefined,
        ...style,
    }

    const chatOverlayBackground = chatStage === 'full' ? 'var(--nous-bg-chat-full)' : 'rgba(0, 0, 0, 0)';

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
                style={{ gridArea: 'rail' }}
            >
                {projectRail}
            </div>

            <div
                data-shell-area="sidebar"
                style={{ gridArea: 'sidebar' }}
            >
                {sidebar}
            </div>

            <div
                data-shell-area="content"
                style={{ gridArea: 'content' }}
            >
                {content}
            </div>

            <div
                data-shell-area="observe"
                style={{ gridArea: 'observe', overflow: 'hidden', position: 'relative', zIndex: 1 }}
            >
                <CollapsibleObserveEdge
                    width={observeWidth}
                    expandedWidth={lastExpandedWidthRef.current}
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
                    height: chatOverlayHeight,
                    zIndex: 10,
                    pointerEvents: 'auto',
                    background: chatOverlayBackground,
                    border: 'none',
                    borderRadius: '0px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'height var(--nous-duration-slow) var(--nous-ease-out), background var(--nous-duration-slow) var(--nous-ease-out)',
                }}
            >
                {chatSlot({ stage: chatStage, onStageChange: internalSetChatStage ?? (() => { }) })}
            </div>

            <ColumnDivider
                aria-label="Resize sidebar column"
                onResize={applySidebarResize}
                style={{
                    left: 'calc(var(--nous-project-rail-width) + var(--shell-sidebar-width))',
                }}
            />

            {observeExpanded ? (
                <ColumnDivider
                    aria-label="Resize observe column"
                    onResize={(delta) => applyObserveResize(delta * -1)}
                    style={{
                        right: 'var(--shell-observe-width)',
                    }}
                />
            ) : null}
        </div>
    )
}
