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

/** Maps chat stage → drawer width inside the simple-shell workspace. */
export const CHAT_STAGE_DRAWER_WIDTH: Record<ChatStage, string> = {
    small: 'var(--shell-chat-drawer-collapsed-width)',
    ambient_small: 'var(--shell-chat-drawer-collapsed-width)',
    ambient_large: 'min(var(--nous-chat-drawer-expanded-width), var(--shell-chat-drawer-available-width))',
    full: 'var(--shell-chat-drawer-available-width)',
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
    '--shell-chat-drawer-collapsed-width': string
    '--shell-chat-drawer-available-width': string
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
    sidebarCollapsed,
    onSidebarCollapseChange: _onSidebarCollapseChange,
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

    // WR-141 — when the sidebar is collapsed, substitute the fixed collapsed-width
    // CSS token in place of the effective width. This is a pure view transformation:
    // `sidebarWidth` state and `sidebarWidthRef.current` are untouched, so expand
    // restores the prior width (SC-4). Instant snap — no `isAnimating` trigger (INV-4).
    const resolvedSidebarWidthCss = sidebarCollapsed
        ? 'var(--nous-asset-sidebar-collapsed-width)'
        : `${effectiveSidebarWidth}px`

    const chatOverlayHeight = CHAT_STAGE_HEIGHT[chatStage]
    const chatDrawerWidth = CHAT_STAGE_DRAWER_WIDTH[chatStage]
    const chatDrawerAvailableWidth = showObserve
        ? 'calc(100% - var(--shell-observe-width) - 5px)'
        : '100%'

    // Click-outside handler — single handler on the layout container
    const handleLayoutClick = React.useCallback((e: React.MouseEvent) => {
        if (chatStage === 'small' || !onClickOutside) return
        // Check if click target is inside the chat overlay
        if (chatOverlayRef.current?.contains(e.target as Node)) return
        onClickOutside()
    }, [chatStage, onClickOutside])

    const layoutStyle: SimpleShellStyle = {
        '--shell-sidebar-width': resolvedSidebarWidthCss,
        '--shell-observe-width': `${observeWidth}px`,
        '--shell-chat-drawer-collapsed-width': 'calc(var(--nous-project-rail-width) + var(--shell-sidebar-width))',
        '--shell-chat-drawer-available-width': chatDrawerAvailableWidth,
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
        gridTemplateRows: 'minmax(0, 1fr)',
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--nous-workspace-canvas-bg)',
        transition: isAnimating ? 'grid-template-columns var(--nous-duration-normal) var(--nous-ease-out)' : undefined,
        ...style,
    }

    const chatOverlayBackground = chatStage === 'full' ? 'var(--nous-bg-chat-full)' : 'var(--nous-chat-drawer-bg)'

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

            {/* Chat drawer — Cortex:Principal container inside the simple-shell workspace. */}
            <div
                ref={chatOverlayRef}
                data-shell-area="chat"
                data-chat-owner="Cortex:Principal"
                data-chat-container="principal-drawer"
                data-chat-stage={chatStage}
                role="complementary"
                aria-label="Cortex Principal chat drawer"
                style={{
                    position: 'absolute',
                    bottom: 'var(--nous-chat-drawer-bottom-offset)',
                    left: 'var(--nous-chat-drawer-left-offset)',
                    width: chatDrawerWidth,
                    minWidth: 'var(--nous-chat-overlay-min-width)',
                    maxWidth: 'var(--shell-chat-drawer-available-width)',
                    height: chatOverlayHeight,
                    zIndex: 10,
                    pointerEvents: 'auto',
                    background: chatOverlayBackground,
                    border: '1px solid var(--nous-chat-drawer-border)',
                    borderRadius: 'var(--nous-chat-drawer-radius)',
                    boxShadow: chatStage === 'small' ? 'none' : 'var(--nous-chat-drawer-shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'width var(--nous-duration-slow) var(--nous-ease-out), height var(--nous-duration-slow) var(--nous-ease-out), background var(--nous-duration-slow) var(--nous-ease-out)',
                }}
            >
                {chatSlot({ stage: chatStage, onStageChange: internalSetChatStage ?? (() => { }) })}
            </div>

            {!sidebarCollapsed ? (
                <ColumnDivider
                    aria-label="Resize sidebar column"
                    onResize={applySidebarResize}
                    style={{
                        left: 'calc(var(--nous-project-rail-width) + var(--shell-sidebar-width))',
                    }}
                />
            ) : null}

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
