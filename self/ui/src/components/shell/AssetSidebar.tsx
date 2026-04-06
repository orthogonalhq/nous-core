import * as React from 'react'
import { clsx } from 'clsx'
import { ChevronDown, Settings, Plus, PanelLeftClose } from 'lucide-react'
import type {
    AssetSection,
    AssetSidebarProps,
} from './types'

// ---------------------------------------------------------------------------
// Collapse persistence
// ---------------------------------------------------------------------------

const COLLAPSE_KEY_PREFIX = 'nous-sidebar-collapse-'

function readCollapseState(sectionId: string, defaultCollapsed: boolean): boolean {
    try {
        const stored = localStorage.getItem(`${COLLAPSE_KEY_PREFIX}${sectionId}`)
        if (stored !== null) return stored === 'true'
    } catch { /* localStorage unavailable */ }
    return defaultCollapsed
}

function writeCollapseState(sectionId: string, collapsed: boolean): void {
    try {
        localStorage.setItem(`${COLLAPSE_KEY_PREFIX}${sectionId}`, String(collapsed))
    } catch { /* localStorage unavailable */ }
}

// ---------------------------------------------------------------------------
// ListItem — single composable button for all sidebar items
// ---------------------------------------------------------------------------

function ListItem({
    id,
    label,
    routeId,
    icon,
    indicatorColor,
    badge,
    isActive,
    disabled,
    onNavigate,
    onItemRename,
}: {
    id: string
    label: string
    routeId: string
    icon?: React.ReactNode
    indicatorColor?: string
    badge?: boolean
    isActive: boolean
    disabled?: boolean
    onNavigate: (routeId: string) => void
    onItemRename?: (itemId: string, newName: string) => void
}) {
    const [hovered, setHovered] = React.useState(false)
    const [isEditing, setIsEditing] = React.useState(false)
    const [editValue, setEditValue] = React.useState(label)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const commitRename = React.useCallback(() => {
        const trimmed = editValue.trim()
        setIsEditing(false)
        if (trimmed && trimmed !== label && onItemRename) {
            onItemRename(id, trimmed)
        } else {
            setEditValue(label)
        }
    }, [editValue, label, id, onItemRename])

    const cancelRename = React.useCallback(() => {
        setIsEditing(false)
        setEditValue(label)
    }, [label])

    const handleClick = React.useCallback(() => {
        if (disabled || isEditing) return
        if (onItemRename) {
            // Delay single click to allow double-click disambiguation
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current)
                clickTimerRef.current = null
            }
            clickTimerRef.current = setTimeout(() => {
                clickTimerRef.current = null
                onNavigate(routeId)
            }, 250)
        } else {
            onNavigate(routeId)
        }
    }, [disabled, isEditing, onItemRename, onNavigate, routeId])

    const handleDoubleClick = React.useCallback(() => {
        if (disabled || !onItemRename) return
        // Cancel pending single-click navigation
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
            clickTimerRef.current = null
        }
        setEditValue(label)
        setIsEditing(true)
    }, [disabled, onItemRename, label])

    // Cleanup timer on unmount
    React.useEffect(() => {
        return () => {
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current)
            }
        }
    }, [])

    return (
        <button
            type="button"
            data-list-item={id}
            data-state={isActive ? 'active' : 'inactive'}
            aria-current={isActive ? 'page' : undefined}
            disabled={disabled}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                ...s.listItemButton,
                background: isActive
                    ? 'var(--nous-bg-active)'
                    : hovered && !disabled
                        ? 'var(--nous-bg-hover)'
                        : 'transparent',
                ...(disabled
                    ? { color: 'var(--nous-text-tertiary)' }
                    : isActive
                        ? { color: 'var(--nous-text-primary)' }
                        : {}
                ),
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : undefined,
            }}
        >
            {(icon || indicatorColor) && (
                <span style={s.listItemIconContainer}>
                    {icon
                        ? <span style={s.listItemIcon}>{icon}</span>
                        : <span style={{ ...s.listItemIndicator, background: indicatorColor }} />
                    }
                </span>
            )}
            {isEditing ? (
                <input
                    ref={inputRef}
                    data-testid={`rename-input-${id}`}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRename()
                        } else if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelRename()
                        }
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={{
                        flex: '1 1 0%',
                        minWidth: 0,
                        fontFamily: 'var(--nous-font-family)',
                        fontSize: 'var(--nous-font-size-md)',
                        color: 'inherit',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        padding: 0,
                        margin: 0,
                        lineHeight: 'inherit',
                    }}
                />
            ) : (
                <span style={s.listItemLabel}>{label}</span>
            )}
            {badge ? <span style={s.listItemBadge} /> : null}
        </button>
    )
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

function SectionHeader({
    section,
    isCollapsed,
    onToggleCollapse,
}: {
    section: AssetSection
    isCollapsed: boolean
    onToggleCollapse: () => void
}) {
    const canInteract = section.collapsible && !section.disabled

    return (
        <div
            data-section-header={section.id}
            style={{
                ...s.sectionHeader,
                opacity: section.disabled ? 0.4 : undefined,
            }}
        >
            <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={canInteract ? onToggleCollapse : undefined}
                style={{
                    ...s.sectionLabel,
                    cursor: canInteract ? 'pointer' : 'default',
                    pointerEvents: section.disabled ? 'none' : undefined,
                }}
            >
                <span>{section.label}</span>
                {section.collapsible && (
                    <span
                        data-collapse-chevron
                        style={{
                            ...s.sectionChevron,
                            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        }}
                    >
                        <ChevronDown size={12} />
                    </span>
                )}
            </button>

            {!section.disabled && (
                <div style={s.sectionActions}>
                    {section.onSettings && (
                        <button type="button" aria-label={`${section.label} settings`} data-action="settings" onClick={section.onSettings} style={s.sectionActionButton}>
                            <Settings size={12} />
                        </button>
                    )}
                    {section.onAdd && (
                        <button type="button" aria-label={`Add ${section.label}`} data-action="add" onClick={section.onAdd} style={s.sectionActionButton}>
                            <Plus size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// AssetSectionBlock
// ---------------------------------------------------------------------------

function AssetSectionBlock({
    section,
    activeRoute,
    onNavigate,
}: {
    section: AssetSection
    activeRoute: string
    onNavigate: (routeId: string) => void
}) {
    const [isCollapsed, setIsCollapsed] = React.useState(() =>
        readCollapseState(section.id, section.defaultCollapsed ?? false),
    )

    const toggleCollapse = () => {
        const next = !isCollapsed
        setIsCollapsed(next)
        writeCollapseState(section.id, next)
    }

    return (
        <div data-asset-section={section.id}>
            <SectionHeader section={section} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} />
            <div
                data-section-items={section.id}
                style={{
                    ...s.sectionCollapseRegion,
                    maxHeight: isCollapsed ? 0 : 2000,
                    opacity: isCollapsed ? 0 : 1,
                }}
            >
                <div style={s.sectionItemList}>
                    {section.items.map((item) => (
                        <ListItem
                            key={item.id}
                            id={item.id}
                            label={item.label}
                            routeId={item.routeId}
                            icon={item.icon}
                            indicatorColor={item.indicatorColor}
                            isActive={item.routeId === activeRoute}
                            disabled={!!section.disabled}
                            onNavigate={onNavigate}
                            onItemRename={section.onItemRename}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// AssetSidebar
// ---------------------------------------------------------------------------

export function AssetSidebar({
    projectName,
    topNav,
    sections,
    activeRoute,
    onNavigate,
    className,
    style,
    ...props
}: AssetSidebarProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>) {
    return (
        <div
            className={clsx('nous-asset-sidebar', className)}
            data-shell-component="asset-sidebar"
            style={{ ...s.root, ...style }}
            {...props}
        >
            {/* Project header */}
            <div data-sidebar-slot="header" style={s.header}>
                <span style={s.headerProjectName}>{projectName}</span>
                <PanelLeftClose size={16} style={s.headerCollapseIcon} />
            </div>

            {/* Scrollable sections */}
            <div data-sidebar-slot="sections" style={s.scrollArea}>
                <div style={s.topNavGroup}>
                    {topNav.map((item) => (
                        <ListItem
                            key={item.id}
                            id={item.id}
                            label={item.label}
                            routeId={item.routeId}
                            icon={item.icon}
                            badge={!!item.badge}
                            isActive={item.routeId === activeRoute}
                            onNavigate={onNavigate}
                        />
                    ))}
                </div>

                <div style={s.sectionsGroup}>
                    {sections.map((section) => (
                        <AssetSectionBlock
                            key={section.id}
                            section={section}
                            activeRoute={activeRoute}
                            onNavigate={onNavigate}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = {
    // ── Layout ──────────────────────────────────────────────────────────
    root: {
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative' as const,
        background: 'var(--nous-bg-surface)',
    },

    // ── Header ──────────────────────────────────────────────────────────
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--nous-space-xl) var(--nous-space-md)',
        borderBottom: '1px solid var(--nous-border-subtle)',
        flexShrink: 0,
    },
    headerProjectName: {
        fontSize: 'var(--nous-font-size-md)',
        fontWeight: 600,
        color: 'var(--nous-sidebar-header-fg)',
        fontFamily: 'var(--nous-font-family)',
    },
    headerCollapseIcon: {
        color: 'var(--nous-text-tertiary)',
        cursor: 'pointer',
    },

    // ── Scroll area ─────────────────────────────────────────────────────
    scrollArea: {
        flex: '1 1 0%',
        overflowY: 'auto' as const,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 'var(--nous-space-xs)',
        padding: 'var(--nous-space-2xl)',
        minHeight: 0,
    },

    // ── List item (shared by top nav + section items) ────────────────────
    listItemButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-lg)',
        width: '100%',
        border: 'none',
        borderRadius: 'var(--nous-radius-md)',
        padding: 'var(--nous-space-sm)',
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-md)',
        color: 'var(--nous-text-secondary)',
        textAlign: 'left' as const,
        cursor: 'pointer',
        transition: 'var(--nous-hover-button-transition)',
    },
    listItemIconContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        height: '22px',
        width: '22px',
    },
    listItemIcon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        color: 'var(--nous-sidebar-section-chevron-fg)',
    },
    listItemIndicator: {
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        flexShrink: 0,
    },
    listItemBadge: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--nous-accent)',
        flexShrink: 0,
        marginLeft: 'auto',
    },

    // ── Top nav ─────────────────────────────────────────────────────────
    topNavGroup: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 1,
        padding: '0 var(--nous-space-xs)',
        paddingBottom: 'var(--nous-space-lg)',
    },

    // ── Sections group ──────────────────────────────────────────────────
    sectionsGroup: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 'var(--nous-space-lg)',
        padding: '0 var(--nous-space-xs)',
        marginTop: 'var(--nous-space-sm)',
    },

    // ── Section header ──────────────────────────────────────────────────
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
        paddingLeft: '0px',
    },
    sectionLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-xs)',
        border: 'none',
        background: 'transparent',
        color: 'var(--nous-text-ghost)',
        fontFamily: 'var(--nous-font-family-mono)',
        fontSize: 'var(--nous-font-size-sm)',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        padding: 0,
    },
    sectionChevron: {
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--nous-sidebar-section-chevron-fg)',
        transition: 'transform 150ms ease-out',
    },
    sectionActions: {
        display: 'flex',
        gap: 'var(--nous-space-xs)',
        color: 'var(--nous-text-ghost)',
    },
    sectionActionButton: {
        display: 'inline-flex',
        alignItems: 'center',
        border: 'none',
        background: 'transparent',
        color: 'var(--nous-sidebar-section-chevron-fg)',
        cursor: 'pointer',
        padding: 2,
    },

    // ── Section items ───────────────────────────────────────────────────
    sectionCollapseRegion: {
        overflow: 'hidden' as const,
        transition: 'max-height var(--nous-duration-normal) var(--nous-ease-out), opacity var(--nous-duration-fast) var(--nous-ease-out)',
    },
    sectionItemList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 'var(--nous-space-2xs)',
    },
    listItemLabel: {
        flex: '1 1 0%',
        minWidth: 0,
        overflow: 'hidden' as const,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
} as const
