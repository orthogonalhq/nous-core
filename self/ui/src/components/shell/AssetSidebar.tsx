import * as React from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { ChevronDown, Settings, Plus, PanelLeftClose, MoreHorizontal } from 'lucide-react'
import type {
    AssetSection,
    AssetSidebarProps,
    ContextMenuAction,
} from './types'
import { CHAT_STAGE_HEIGHT } from './SimpleShellLayout'

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
// SidebarContextMenu — portal-based context menu (follows NodeContextMenu pattern)
// ---------------------------------------------------------------------------

function SidebarContextMenu({
    position,
    itemId,
    itemLabel,
    onRename,
    contextMenuActions,
    onClose,
}: {
    position: { x: number; y: number }
    itemId: string
    itemLabel: string
    onRename?: (itemId: string, newName: string) => void
    contextMenuActions?: ContextMenuAction[]
    onClose: () => void
}) {
    const menuRef = React.useRef<HTMLDivElement>(null)
    const [clampedPosition, setClampedPosition] = React.useState(position)

    // Clamp position to viewport bounds after render
    React.useEffect(() => {
        if (!menuRef.current) return
        const rect = menuRef.current.getBoundingClientRect()
        setClampedPosition({
            x: Math.min(position.x, window.innerWidth - rect.width - 8),
            y: Math.min(position.y, window.innerHeight - rect.height - 8),
        })
    }, [position])

    // Click outside dismissal
    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    // Escape key dismissal
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    const [isRenaming, setIsRenaming] = React.useState(false)
    const [renameValue, setRenameValue] = React.useState(itemLabel)
    const renameInputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        if (isRenaming) {
            requestAnimationFrame(() => {
                renameInputRef.current?.focus()
                renameInputRef.current?.select()
            })
        }
    }, [isRenaming])

    const commitRename = React.useCallback(() => {
        if (!onRename) return
        const trimmed = renameValue.trim()
        if (trimmed !== '' && trimmed !== itemLabel) {
            onRename(itemId, trimmed)
        }
        onClose()
    }, [renameValue, itemLabel, itemId, onRename, onClose])

    return createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                zIndex: 99999,
                left: clampedPosition.x,
                top: clampedPosition.y,
                background: 'var(--nous-bg-elevated)',
                border: '1px solid var(--nous-border)',
                borderRadius: 'var(--nous-radius-sm)',
                padding: '4px 0',
                minWidth: 180,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                fontSize: 'var(--nous-font-size-xs)',
                color: 'var(--nous-fg)',
            }}
            data-testid="sidebar-context-menu"
            role="menu"
            aria-label="Sidebar item context menu"
        >
            {isRenaming ? (
                <div style={{ padding: '4px 8px' }}>
                    <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                            if (e.key === 'Escape') { e.preventDefault(); onClose() }
                        }}
                        onBlur={commitRename}
                        style={{
                            width: '100%',
                            background: 'var(--nous-bg)',
                            border: '1px solid var(--nous-border)',
                            borderRadius: 'var(--nous-radius-sm)',
                            padding: '4px 8px',
                            color: 'var(--nous-fg)',
                            fontSize: 'inherit',
                            outline: 'none',
                        }}
                        data-testid="context-menu-rename-input"
                    />
                </div>
            ) : (
                <>
                    {onRename && (
                        <button
                            type="button"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 12px',
                                cursor: 'pointer',
                                background: 'transparent',
                                border: 'none',
                                color: 'inherit',
                                fontSize: 'inherit',
                                width: '100%',
                                textAlign: 'left',
                            }}
                            onClick={() => setIsRenaming(true)}
                            role="menuitem"
                            data-testid="context-menu-rename"
                        >
                            Rename
                        </button>
                    )}
                    {contextMenuActions?.filter(a => a.variant !== 'danger').map(action => (
                        <button
                            key={action.id}
                            type="button"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 12px',
                                cursor: 'pointer',
                                background: 'transparent',
                                border: 'none',
                                color: 'inherit',
                                fontSize: 'inherit',
                                width: '100%',
                                textAlign: 'left',
                            }}
                            onClick={() => { action.handler(itemId); onClose() }}
                            role="menuitem"
                            data-testid={`context-menu-action-${action.id}`}
                        >
                            {action.label}
                        </button>
                    ))}
                    {contextMenuActions?.some(a => a.variant === 'danger') && (
                        <div style={{
                            borderTop: '1px solid var(--nous-border-subtle)',
                            margin: '4px 0',
                        }} />
                    )}
                    {contextMenuActions?.filter(a => a.variant === 'danger').map(action => (
                        <button
                            key={action.id}
                            type="button"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 12px',
                                cursor: 'pointer',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--nous-alert-error)',
                                fontSize: 'inherit',
                                width: '100%',
                                textAlign: 'left',
                            }}
                            onClick={() => { action.handler(itemId); onClose() }}
                            role="menuitem"
                            data-testid={`context-menu-action-${action.id}`}
                        >
                            {action.label}
                        </button>
                    ))}
                </>
            )}
        </div>,
        document.body,
    )
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
    hasContextActions,
    onContextMenu: onContextMenuProp,
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
    hasContextActions?: boolean
    onContextMenu?: (info: { itemId: string; itemLabel: string; x: number; y: number }) => void
}) {
    const [hovered, setHovered] = React.useState(false)

    const handleClick = React.useCallback(() => {
        if (disabled) return
        onNavigate(routeId)
    }, [disabled, onNavigate, routeId])

    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        if (!onContextMenuProp) return
        e.preventDefault()
        onContextMenuProp({ itemId: id, itemLabel: label, x: e.clientX, y: e.clientY })
    }, [onContextMenuProp, id, label])

    const handleDotsClick = React.useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        if (!onContextMenuProp) return
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onContextMenuProp({ itemId: id, itemLabel: label, x: rect.left, y: rect.bottom })
    }, [onContextMenuProp, id, label])

    return (
        <button
            type="button"
            data-list-item={id}
            data-state={isActive ? 'active' : 'inactive'}
            aria-current={isActive ? 'page' : undefined}
            disabled={disabled}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
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
            <span style={s.listItemLabel}>{label}</span>
            {(onItemRename || hasContextActions) && hovered && (
                <span
                    data-testid={`dots-button-${id}`}
                    role="button"
                    tabIndex={-1}
                    onClick={handleDotsClick}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        marginLeft: 'auto',
                        padding: 2,
                        cursor: 'pointer',
                        color: 'var(--nous-text-tertiary)',
                    }}
                >
                    <MoreHorizontal size={14} />
                </span>
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
    const [contextMenu, setContextMenu] = React.useState<{
        itemId: string
        itemLabel: string
        position: { x: number; y: number }
    } | null>(null)

    const toggleCollapse = () => {
        const next = !isCollapsed
        setIsCollapsed(next)
        writeCollapseState(section.id, next)
    }

    const handleOpenContextMenu = React.useCallback((info: { itemId: string; itemLabel: string; x: number; y: number }) => {
        setContextMenu({ itemId: info.itemId, itemLabel: info.itemLabel, position: { x: info.x, y: info.y } })
    }, [])

    const handleCloseContextMenu = React.useCallback(() => {
        setContextMenu(null)
    }, [])

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
                            hasContextActions={!!section.contextMenuActions?.length}
                            onContextMenu={(section.onItemRename || section.contextMenuActions?.length) ? handleOpenContextMenu : undefined}
                        />
                    ))}
                </div>
            </div>
            {contextMenu && (section.onItemRename || section.contextMenuActions?.length) && (
                <SidebarContextMenu
                    position={contextMenu.position}
                    itemId={contextMenu.itemId}
                    itemLabel={contextMenu.itemLabel}
                    onRename={section.onItemRename}
                    contextMenuActions={section.contextMenuActions}
                    onClose={handleCloseContextMenu}
                />
            )}
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
    chatStage,
    onSettingsClick,
    className,
    style,
    ...props
}: AssetSidebarProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>) {
    const scrollPaddingBottom = chatStage
        ? CHAT_STAGE_HEIGHT[chatStage]
        : CHAT_STAGE_HEIGHT['ambient_large'] // safe default: largest resting state

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)' }}>
                    {onSettingsClick && (
                        <button
                            type="button"
                            aria-label="Project settings"
                            onClick={onSettingsClick}
                            style={s.sectionActionButton}
                        >
                            <Settings size={16} />
                        </button>
                    )}
                    <PanelLeftClose size={16} style={s.headerCollapseIcon} />
                </div>
            </div>

            {/* Scrollable sections */}
            <div data-sidebar-slot="sections" style={{ ...s.scrollArea, paddingBottom: scrollPaddingBottom }}>
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
