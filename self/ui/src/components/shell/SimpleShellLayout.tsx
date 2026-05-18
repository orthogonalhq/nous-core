'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { ColumnDivider } from './ColumnDivider'
import { CollapsibleObserveEdge } from './CollapsibleObserveEdge'
import type { ChatStage, ShellBreakpoint, SimpleShellLayoutProps } from './types'

const DEFAULT_SIDEBAR_WIDTH = 236
const DEFAULT_OBSERVE_WIDTH = 340
const MIN_SIDEBAR_WIDTH = 236
const MIN_OBSERVE_WIDTH = 32
const MAX_SIDEBAR_WIDTH = 236
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
    medium: 236,
    narrow: 236,
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
        ? 'min(var(--nous-chat-drawer-expanded-width), calc(100% - var(--shell-sidebar-width) - 48px))'
        : 'min(var(--nous-chat-drawer-expanded-width), calc(100% - 48px))'

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
        gridTemplateAreas: '"rail sidebar content observe"',
        gridTemplateColumns: [
            'var(--nous-project-rail-width)',
            'var(--shell-sidebar-width)',
            '1fr',
            showObserve ? 'var(--shell-observe-width)' : '0px',
        ].join(' '),
        gridTemplateRows: 'minmax(0, 1fr)',
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: 'var(--nous-workspace-shell-inset)',
        gap: 0,
        background: 'var(--nous-workspace-shell-frame-bg)',
        border: '1px solid var(--nous-workspace-shell-border)',
        borderRadius: 'var(--nous-radius-xl, 16px)',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.045)',
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
                data-reference-extraction="TOPO-03 DIM-02 STATE-03"
                style={{ gridArea: 'rail', overflow: 'hidden' }}
            >
                {projectRail}
            </div>

            <div
                data-shell-area="sidebar"
                data-reference-extraction="TOPO-05 DIM-03 STATE-04 STATE-05"
                style={{ gridArea: 'sidebar', overflow: 'hidden', borderInlineEnd: '1px solid var(--nous-workspace-sidebar-border)' }}
            >
                {sidebar}
            </div>

            <div
                data-shell-area="content"
                data-visual-shell-fidelity="workspace-canvas"
                data-reference-extraction="TOPO-06 DIM-05 DIM-14 STATE-11 STATE-12"
                style={{
                    gridArea: 'content',
                    minWidth: 0,
                    overflow: 'hidden',
                    background: 'var(--nous-workspace-canvas-bg)',
                    backgroundImage: 'var(--nous-workspace-canvas-overlay)',
                    border: '1px solid var(--nous-workspace-shell-border)',
                    borderRadius: 0,
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                }}
            >
                {content}
            </div>

            <div
                data-shell-area="observe"
                data-reference-extraction="TOPO-07 DIM-04 DIM-15 STATE-13 STATE-14"
                style={{ gridArea: 'observe', overflow: 'hidden', position: 'relative', zIndex: 1, borderInlineStart: '1px solid var(--nous-workspace-sidebar-border)', background: 'var(--nous-workspace-updates-panel-bg)' }}
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
                    top: 'var(--nous-chat-drawer-top-offset)',
                    right: 'var(--nous-chat-drawer-right-offset)',
                    bottom: 'var(--nous-chat-drawer-bottom-offset)',
                    left: 'auto',
                    width: chatDrawerWidth,
                    minWidth: 'var(--nous-chat-overlay-min-width)',
                    maxWidth: 'var(--shell-chat-drawer-available-width)',
                    height: chatStage === 'small' || chatStage === 'ambient_small' ? chatOverlayHeight : 'auto',
                    zIndex: 10,
                    pointerEvents: 'auto',
                    background: chatOverlayBackground,
                    border: '1px solid var(--nous-chat-drawer-border)',
                    borderRadius: 'var(--nous-chat-drawer-radius)',
                    boxShadow: chatStage === 'small' ? 'none' : 'var(--nous-chat-drawer-shadow)',
                    display: chatStage === 'small' ? 'flex' : 'grid',
                    gridTemplateRows: chatStage === 'small' ? undefined : 'auto minmax(0, 1fr) auto',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'width var(--nous-duration-slow) var(--nous-ease-out), height var(--nous-duration-slow) var(--nous-ease-out), background var(--nous-duration-slow) var(--nous-ease-out)',
                }}
            >
                {chatStage === 'small' ? (
                    chatSlot({ stage: chatStage, onStageChange: internalSetChatStage ?? (() => { }) })
                ) : (
                    <ReferenceDrawerFrame
                        chatSlot={chatSlot({ stage: chatStage, onStageChange: internalSetChatStage ?? (() => { }) })}
                    />
                )}
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

function ReferenceDrawerFrame({ chatSlot }: { chatSlot: React.ReactNode }) {
    const topics = ['Review client intakes', 'Email drafts', 'Follow-up queue', 'Plan next intake']
    const changes = ['Updated intake scoring thresholds', 'Drafted revised approval plan', 'Prepared owner follow-up queue']
    const actions = ['Approve revised plan', 'Send next intake', 'Open source notes']

    return (
        <>
            <div style={drawerHeaderStyle} data-reference-extraction="STATE-07 TYPE-09 PAL-12">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={drawerTabStyle}>Nue</span>
                    <span style={drawerTabStyle}>Coaching</span>
                    <span style={{ ...drawerTabStyle, background: 'rgba(91, 124, 255, 0.16)', color: '#fff' }}>Client Onboarding</span>
                </div>
                <div style={drawerHeaderActionsStyle} aria-label="Drawer actions">
                    <button type="button" style={drawerGlyphButtonStyle}>History</button>
                    <button type="button" style={drawerGlyphButtonStyle}>Close</button>
                </div>
            </div>
            <div style={drawerBodyStyle}>
                <nav style={drawerTopicRailStyle} aria-label="Drawer topics">
                    {topics.map((topic, index) => (
                        <button type="button" key={topic} style={{ ...drawerTopicStyle, ...(index === 0 ? drawerTopicActiveStyle : null) }}>
                            {topic}
                        </button>
                    ))}
                </nav>
                <section style={drawerConversationStyle}>
                    <p style={drawerIntroText}>I reviewed the latest client intake run and found three changes worth approving before the next batch.</p>
                    <div style={drawerMessageStyle}>This direction looks good. Show me the revised plan first, then move to the next intake.</div>
                    <div style={drawerResultStyle}>
                        <div style={drawerResultMetaStyle}>Worked for 18s</div>
                        <h3 style={drawerResultTitleStyle}>The revised plan is ready.</h3>
                        <p style={drawerMutedText}>I tightened the intake review path, kept owner approvals explicit, and staged the next batch so nothing has been sent yet.</p>
                        <div style={drawerDetailsGridStyle}>
                            <span>Details</span>
                            <span>3 approval points</span>
                            <span>Status</span>
                            <span>Nothing has been sent yet.</span>
                        </div>
                        <div>
                            <h4 style={drawerSectionLabelStyle}>Changes made</h4>
                            <div style={drawerListStyle}>
                                {changes.map((change) => <div key={change} style={drawerListItemStyle}>{change}</div>)}
                            </div>
                        </div>
                        <div>
                            <h4 style={drawerSectionLabelStyle}>Suggested actions</h4>
                            <div style={drawerActionListStyle}>
                                {actions.map((action) => <button type="button" key={action} style={drawerActionButtonStyle}>{action}</button>)}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'none' }} aria-hidden="true">{chatSlot}</div>
                </section>
            </div>
            <div style={drawerCommandStyle} data-reference-extraction="STATE-09 DIM-18">
                <div style={drawerCommandInputStyle}>
                    <span>This direction looks good. Show me the revised plan first, then move to the next intake.</span>
                    <span style={{ color: 'var(--nous-workspace-info)' }}>|</span>
                </div>
                <div style={drawerCommandToolbarStyle} aria-label="Command toolbar">
                    <span>Attach</span>
                    <span>Reference</span>
                    <span>Voice</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--nous-workspace-info)' }}>Send</span>
                </div>
            </div>
        </>
    )
}

const drawerHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    borderBottom: '1px solid var(--nous-chat-drawer-border)',
}

const drawerHeaderActionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
}

const drawerGlyphButtonStyle: React.CSSProperties = {
    height: 24,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.035)',
    color: 'var(--nous-fg-subtle)',
    fontFamily: 'var(--nous-font-family-mono)',
    fontSize: 'var(--nous-type-micro-xs, 10px)',
    padding: '0 8px',
}

const drawerTabStyle: React.CSSProperties = {
    borderRadius: 999,
    padding: '4px 8px',
    color: 'var(--nous-fg-subtle)',
    fontSize: 'var(--nous-type-micro-sm, 11px)',
    fontFamily: 'var(--nous-font-family-mono)',
}

const drawerBodyStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    minHeight: 0,
}

const drawerTopicRailStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
    minWidth: 0,
    overflowX: 'auto',
    padding: '16px 16px 0',
}

const drawerTopicStyle: React.CSSProperties = {
    flex: '0 0 auto',
    border: '1px solid transparent',
    borderRadius: 999,
    background: 'transparent',
    padding: '4px 8px',
    color: 'var(--nous-fg-subtle)',
    fontSize: 'var(--nous-type-micro-xs, 10px)',
    fontFamily: 'var(--nous-font-family-mono)',
    cursor: 'default',
}

const drawerTopicActiveStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    color: '#fff',
}

const drawerConversationStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    minHeight: 0,
    overflow: 'auto',
    padding: '16px 20px',
    fontSize: 'var(--nous-font-size-xs)',
    lineHeight: 1.28,
}

const drawerIntroText: React.CSSProperties = {
    color: 'var(--nous-fg-muted)',
    margin: 0,
    maxWidth: 360,
}

const drawerMutedText: React.CSSProperties = {
    color: 'var(--nous-fg-muted)',
    margin: 0,
}

const drawerMessageStyle: React.CSSProperties = {
    marginLeft: 48,
    borderRadius: 13,
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.055)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
}

const drawerResultStyle: React.CSSProperties = {
    display: 'grid',
    gap: 16,
    borderRadius: 12,
    padding: 16,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
}

const drawerResultMetaStyle: React.CSSProperties = {
    color: 'var(--nous-fg-subtle)',
    fontFamily: 'var(--nous-font-family-mono)',
    fontSize: 'var(--nous-type-micro-sm, 11px)',
    fontWeight: 600,
}

const drawerResultTitleStyle: React.CSSProperties = {
    margin: 0,
    color: 'var(--nous-fg)',
    fontSize: 'var(--nous-font-size-sm)',
    fontWeight: 600,
}

const drawerDetailsGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '96px minmax(0, 1fr)',
    gap: '8px 12px',
    color: 'var(--nous-fg-muted)',
    fontSize: 'var(--nous-type-micro-sm, 11px)',
}

const drawerSectionLabelStyle: React.CSSProperties = {
    margin: '0 0 8px',
    color: 'var(--nous-fg)',
    fontFamily: 'var(--nous-font-family-mono)',
    fontSize: 'var(--nous-type-meta, 12px)',
    fontWeight: 600,
}

const drawerListStyle: React.CSSProperties = {
    display: 'grid',
    gap: 8,
}

const drawerListItemStyle: React.CSSProperties = {
    borderRadius: 8,
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.035)',
    border: '1px solid rgba(255, 255, 255, 0.065)',
    color: 'var(--nous-fg-muted)',
}

const drawerActionListStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
}

const drawerActionButtonStyle: React.CSSProperties = {
    border: '1px solid rgba(91, 124, 255, 0.28)',
    borderRadius: 999,
    background: 'rgba(91, 124, 255, 0.10)',
    color: '#dfe6ff',
    fontFamily: 'var(--nous-font-family-mono)',
    fontSize: 'var(--nous-type-micro-xs, 10px)',
    padding: '5px 9px',
}

const drawerCommandStyle: React.CSSProperties = {
    minHeight: 104,
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto',
    gap: 12,
    padding: 20,
    borderTop: '1px solid var(--nous-chat-drawer-border)',
    color: '#fff',
    fontSize: 'var(--nous-font-size-xs)',
    lineHeight: 1.35,
}

const drawerCommandInputStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
}

const drawerCommandToolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: 'var(--nous-fg-subtle)',
    fontFamily: 'var(--nous-font-family-mono)',
    fontSize: 'var(--nous-type-micro-xs, 10px)',
}
