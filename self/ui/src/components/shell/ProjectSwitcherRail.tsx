'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { Plus, Bot, AlertCircle, ChevronDown } from 'lucide-react'
import type { ProjectItem, ProjectSwitcherRailProps } from './types'
import { isHomeSidebarEnabled } from './feature-flags'
import { resolveRailIcon } from './rail-icon-resolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hue from project ID via simple hash. */
function avatarColorFromId(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0
    }
    const hue = ((hash % 360) + 360) % 360
    return `hsl(${hue}, 60%, 50%)`
}

function getInitial(name: string): string {
    return name.charAt(0).toUpperCase()
}

const ARCHIVED_OPACITY = 0.45

// ---------------------------------------------------------------------------
// RailContextMenu — bespoke portal-based context menu (pattern cloned from
// AssetSidebar's SidebarContextMenu). One item: Archive or Unarchive.
// ---------------------------------------------------------------------------

function RailContextMenu({
    position,
    projectId,
    isArchived,
    onArchive,
    onUnarchive,
    onClose,
}: {
    position: { x: number; y: number }
    projectId: string
    isArchived: boolean
    onArchive?: (id: string) => void | Promise<void>
    onUnarchive?: (id: string) => void | Promise<void>
    onClose: () => void
}) {
    const menuRef = React.useRef<HTMLDivElement>(null)
    const [clamped, setClamped] = React.useState(position)

    React.useEffect(() => {
        if (!menuRef.current) return
        const rect = menuRef.current.getBoundingClientRect()
        setClamped({
            x: Math.min(position.x, window.innerWidth - rect.width - 8),
            y: Math.min(position.y, window.innerHeight - rect.height - 8),
        })
    }, [position])

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    const handleAction = React.useCallback(() => {
        if (isArchived) {
            void onUnarchive?.(projectId)
        } else {
            void onArchive?.(projectId)
        }
        onClose()
    }, [isArchived, onArchive, onUnarchive, projectId, onClose])

    return createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                zIndex: 99999,
                left: clamped.x,
                top: clamped.y,
                background: 'var(--nous-bg-elevated)',
                border: '1px solid var(--nous-border)',
                borderRadius: 'var(--nous-radius-sm)',
                padding: '4px 0',
                minWidth: 140,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                fontSize: 'var(--nous-font-size-xs)',
                color: 'var(--nous-fg)',
            }}
            data-testid="rail-context-menu"
            role="menu"
            aria-label="Project rail context menu"
        >
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
                onClick={handleAction}
                role="menuitem"
                data-testid={isArchived ? 'rail-menu-unarchive' : 'rail-menu-archive'}
            >
                {isArchived ? 'Unarchive' : 'Archive'}
            </button>
        </div>,
        document.body,
    )
}

// ---------------------------------------------------------------------------
// ProjectAvatar — renders lucide / emoji / initial-letter per SDS § Rail icon
// rendering dispatch. Archived projects wrap with reduced opacity.
// ---------------------------------------------------------------------------

function ProjectAvatar({
    project,
    isActive,
    isSubdued,
    archived,
    selectable,
    onSelect,
    onContextMenu,
}: {
    project: ProjectItem
    isActive: boolean
    /** When true, show a subtle indicator instead of the full active bar (e.g. home context) */
    isSubdued?: boolean
    archived?: boolean
    selectable: boolean
    onSelect: (id: string) => void
    onContextMenu: (e: React.MouseEvent<HTMLButtonElement>, project: ProjectItem) => void
}) {
    const [hovered, setHovered] = React.useState(false)
    const resolved = resolveRailIcon(project.icon)
    const background = project.color ?? avatarColorFromId(project.id)

    let inner: React.ReactNode = getInitial(project.name)
    if (resolved.kind === 'lucide') {
        const Icon = resolved.Component
        inner = <Icon size={18} color="#ffffff" />
    } else if (resolved.kind === 'emoji') {
        inner = <span style={{ fontSize: 18, lineHeight: 1 }}>{resolved.glyph}</span>
    }

    return (
        <div
            style={{
                ...styles.avatarWrap,
                opacity: archived ? ARCHIVED_OPACITY : 1,
            }}
            data-archived={archived ? 'true' : undefined}
        >
            {isActive && !archived && (
                <span data-active-indicator style={isSubdued ? styles.ghostIndicator : styles.activeIndicator} />
            )}
            <button
                type="button"
                aria-label={project.name}
                title={project.name}
                aria-current={isActive && !archived ? 'true' : undefined}
                data-project-id={project.id}
                onClick={() => {
                    if (!selectable) return
                    onSelect(project.id)
                }}
                onContextMenu={(e) => onContextMenu(e, project)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    ...styles.avatarButton,
                    background,
                    cursor: selectable ? 'pointer' : 'default',
                    opacity: hovered && !isActive && selectable ? 0.85 : 1,
                }}
            >
                {inner}
            </button>
        </div>
    )
}

// ---------------------------------------------------------------------------
// LoadingSkeletons — SDS § UX Contract loading shape.
// ---------------------------------------------------------------------------

function LoadingSkeletons() {
    return (
        <>
            {[0, 1, 2].map((i) => (
                <div key={i} style={styles.avatarWrap}>
                    <div
                        data-testid="rail-skeleton"
                        style={{
                            width: 'var(--nous-rail-avatar-size, 32px)',
                            height: 'var(--nous-rail-avatar-size, 32px)',
                            borderRadius: 'var(--nous-radius-md)',
                            background: 'var(--nous-bg-skeleton, rgba(255,255,255,0.08))',
                            animation: 'nous-skeleton-pulse 1.4s ease-in-out infinite',
                        }}
                    />
                </div>
            ))}
            <style>{`
                @keyframes nous-skeleton-pulse {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
            `}</style>
        </>
    )
}

// ---------------------------------------------------------------------------
// ErrorBlock — SDS § UX Contract error shape.
// ---------------------------------------------------------------------------

function ErrorBlock({
    message,
    onRetry,
    testId,
}: {
    message: string
    onRetry?: () => void
    testId?: string
}) {
    const style: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 8,
        color: 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-xs)',
        textAlign: 'center',
    }
    const body = (
        <>
            <AlertCircle size={16} />
            <span>{message}</span>
        </>
    )
    if (onRetry) {
        return (
            <button
                type="button"
                onClick={onRetry}
                style={{ ...style, background: 'transparent', border: 'none', cursor: 'pointer' }}
                data-testid={testId ?? 'rail-error-retry'}
            >
                {body}
            </button>
        )
    }
    return (
        <div style={style} data-testid={testId ?? 'rail-error'} role="status">
            {body}
        </div>
    )
}

// ---------------------------------------------------------------------------
// ProjectSwitcherRail
// ---------------------------------------------------------------------------

export function ProjectSwitcherRail({
    projects,
    activeProjectId,
    onProjectSelect,
    onNewProject,
    onHomeClick,
    isHomeActive,
    brandSlot,
    isLoading,
    isError,
    errorMessage,
    onRetry,
    onArchiveProject,
    onUnarchiveProject,
    archivedViewOpen,
    onToggleArchivedView,
    archivedIsLoading,
    archivedIsError,
    archiveErrorMessage,
    className,
    style,
    ...props
}: ProjectSwitcherRailProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'onError'>) {
    const showHomeButton = isHomeSidebarEnabled() && onHomeClick
    const [homeHovered, setHomeHovered] = React.useState(false)
    const [menu, setMenu] = React.useState<{
        x: number
        y: number
        projectId: string
        isArchived: boolean
    } | null>(null)

    const activeProjects = React.useMemo(
        () => projects.filter((p) => p.archived !== true),
        [projects],
    )
    const archivedProjects = React.useMemo(
        () => projects.filter((p) => p.archived === true),
        [projects],
    )

    const handleContextMenu = React.useCallback(
        (event: React.MouseEvent<HTMLButtonElement>, project: ProjectItem) => {
            if (!onArchiveProject && !onUnarchiveProject) return
            event.preventDefault()
            setMenu({
                x: event.clientX,
                y: event.clientY,
                projectId: project.id,
                isArchived: project.archived === true,
            })
        },
        [onArchiveProject, onUnarchiveProject],
    )

    const closeMenu = React.useCallback(() => setMenu(null), [])

    const archivedCount = archivedProjects.length
    const showArchivedToggle = onToggleArchivedView !== undefined && (archivedViewOpen || archivedCount > 0)

    return (
        <div
            className={clsx('nous-project-switcher-rail', className)}
            data-shell-component="project-switcher-rail"
            data-rail-active-count={activeProjects.length}
            data-rail-archived-count={archivedCount}
            style={{ ...styles.root, ...style }}
            {...props}
        >
            {brandSlot && (
                <div data-rail-slot="brand" style={styles.brandSlot}>
                    {brandSlot}
                </div>
            )}

            {showHomeButton && (
                <div style={styles.avatarWrap}>
                    {isHomeActive && <span data-active-indicator style={styles.activeIndicator} />}
                    <button
                        type="button"
                        aria-label="Home"
                        data-rail-action="home"
                        aria-current={isHomeActive ? 'true' : undefined}
                        onClick={onHomeClick}
                        onMouseEnter={() => setHomeHovered(true)}
                        onMouseLeave={() => setHomeHovered(false)}
                        style={{
                            ...styles.homeButton,
                            opacity: homeHovered && !isHomeActive ? 0.85 : 1,
                            background: isHomeActive
                                ? 'var(--nous-bg-active, rgba(255,255,255,0.1))'
                                : 'transparent',
                        }}
                    >
                        <Bot size={20} />
                    </button>
                </div>
            )}

            {showHomeButton && (activeProjects.length > 0 || isLoading || isError) && (
                <span data-rail-divider style={styles.divider} />
            )}

            <div style={styles.projectList}>
                {isLoading && activeProjects.length === 0 && !isError ? (
                    <LoadingSkeletons />
                ) : isError ? (
                    <ErrorBlock
                        message={errorMessage ?? "Couldn't load projects. Tap to retry."}
                        onRetry={onRetry}
                    />
                ) : (
                    activeProjects.map((project) => (
                        <ProjectAvatar
                            key={project.id}
                            project={project}
                            isActive={project.id === activeProjectId}
                            isSubdued={isHomeActive}
                            selectable
                            onSelect={onProjectSelect}
                            onContextMenu={handleContextMenu}
                        />
                    ))
                )}

                {archiveErrorMessage && (
                    <div
                        role="status"
                        data-testid="rail-archive-error"
                        style={{
                            padding: 6,
                            margin: '4px 8px',
                            fontSize: 'var(--nous-font-size-xs)',
                            color: 'var(--nous-text-secondary)',
                            textAlign: 'center',
                            background: 'var(--nous-bg-hover, rgba(255,255,255,0.05))',
                            borderRadius: 'var(--nous-radius-sm)',
                        }}
                    >
                        {archiveErrorMessage}
                    </div>
                )}

                {showArchivedToggle && (
                    <>
                        <button
                            type="button"
                            data-rail-action="toggle-archived"
                            data-testid="rail-archived-toggle"
                            aria-expanded={archivedViewOpen ? 'true' : 'false'}
                            onClick={onToggleArchivedView}
                            style={styles.archivedToggle}
                        >
                            <ChevronDown
                                size={12}
                                style={{
                                    transform: archivedViewOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    transition: 'transform 0.15s ease',
                                }}
                            />
                            <span>Archived ({archivedCount})</span>
                        </button>
                        {archivedViewOpen && (
                            <div data-testid="rail-archived-list" style={styles.archivedList}>
                                {archivedIsLoading ? (
                                    <LoadingSkeletons />
                                ) : archivedIsError ? (
                                    <ErrorBlock
                                        message="Couldn't load archived projects."
                                        testId="rail-archived-error"
                                    />
                                ) : archivedProjects.length === 0 ? (
                                    <div
                                        style={{
                                            padding: 8,
                                            fontSize: 'var(--nous-font-size-xs)',
                                            color: 'var(--nous-text-secondary)',
                                            textAlign: 'center',
                                        }}
                                        data-testid="rail-archived-empty"
                                    >
                                        No archived projects.
                                    </div>
                                ) : (
                                    archivedProjects.map((project) => (
                                        <ProjectAvatar
                                            key={project.id}
                                            project={project}
                                            isActive={false}
                                            archived
                                            selectable={false}
                                            onSelect={() => {
                                                /* archived projects are not selectable */
                                            }}
                                            onContextMenu={handleContextMenu}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {onNewProject && (
                <button
                    type="button"
                    aria-label="New project"
                    data-rail-action="new-project"
                    onClick={onNewProject}
                    style={styles.newProjectButton}
                >
                    <Plus size={14} />
                </button>
            )}

            {menu && (
                <RailContextMenu
                    position={{ x: menu.x, y: menu.y }}
                    projectId={menu.projectId}
                    isArchived={menu.isArchived}
                    onArchive={onArchiveProject}
                    onUnarchive={onUnarchiveProject}
                    onClose={closeMenu}
                />
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
    root: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        width: 'var(--nous-project-rail-width)',
        minWidth: 'var(--nous-project-rail-width)',
        height: '100%',
        padding: 'var(--nous-space-lg) 0',
        gap: 'var(--nous-space-sm)',
        background: 'var(--nous-rail-bg)',
        borderInlineEnd: '1px solid var(--nous-border-subtle)',
        boxSizing: 'border-box' as const,
    },
    brandSlot: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingBottom: 'var(--nous-space-sm)',
        borderBottom: '1px solid var(--nous-border-subtle)',
    },
    divider: {
        display: 'block',
        width: '60%',
        height: '2px',
        borderRadius: '1px',
        background: 'var(--nous-border-subtle)',
        flexShrink: 0,
    },
    projectList: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 'var(--nous-space-sm)',
        flex: '1 1 0%',
        overflowY: 'auto' as const,
        width: '100%',
    },
    avatarWrap: {
        position: 'relative' as const,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    activeIndicator: {
        position: 'absolute' as const,
        left: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 'var(--nous-rail-indicator-width)',
        height: 'var(--nous-rail-indicator-height)',
        borderRadius: '0 var(--nous-space-2xs) var(--nous-space-2xs) 0',
        background: 'var(--nous-fg-muted)',
    },
    ghostIndicator: {
        position: 'absolute' as const,
        left: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 'var(--nous-rail-indicator-width)',
        height: 'var(--nous-rail-indicator-height)',
        borderRadius: '0 var(--nous-space-2xs) var(--nous-space-2xs) 0',
        background: 'var(--nous-fg-muted)',
        opacity: 0.3,
    },
    avatarButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--nous-rail-avatar-size)',
        height: 'var(--nous-rail-avatar-size)',
        borderRadius: 'var(--nous-radius-md)',
        border: '2px solid transparent',
        color: 'var(--nous-fg-on-color)',
        fontSize: 'var(--nous-font-size-2xl)',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'var(--nous-hover-button-transition)',
        padding: 0,
        outline: 'none',
    },
    homeButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--nous-rail-avatar-size)',
        height: 'var(--nous-rail-avatar-size)',
        borderRadius: 'var(--nous-radius-md)',
        border: '1px solid var(--nous-border-subtle)',
        color: 'var(--nous-text-secondary)',
        cursor: 'pointer',
        padding: 0,
        transition: 'var(--nous-hover-button-transition)',
    },
    newProjectButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--nous-rail-avatar-size)',
        height: 'var(--nous-rail-avatar-size)',
        borderRadius: 'var(--nous-radius-lg, 10px)',
        border: '1px dashed var(--nous-border-subtle)',
        background: 'transparent',
        color: 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-sm)',
        cursor: 'pointer',
        padding: 0,
        transition: 'var(--nous-hover-button-transition)',
    },
    archivedToggle: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        marginTop: 'var(--nous-space-sm)',
        background: 'transparent',
        border: 'none',
        color: 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-2xs, 10px)',
        cursor: 'pointer',
        borderRadius: 'var(--nous-radius-sm)',
    },
    archivedList: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 'var(--nous-space-sm)',
        width: '100%',
        paddingTop: 'var(--nous-space-sm)',
    },
} as const
