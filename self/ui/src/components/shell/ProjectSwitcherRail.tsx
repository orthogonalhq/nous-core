import * as React from 'react'
import { clsx } from 'clsx'
import { Plus, Bot } from 'lucide-react'
import type { ProjectItem, ProjectSwitcherRailProps } from './types'
import { isHomeSidebarEnabled } from './feature-flags'

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

// ---------------------------------------------------------------------------
// ProjectAvatar
// ---------------------------------------------------------------------------

function ProjectAvatar({
    project,
    isActive,
    isSubdued,
    onSelect,
}: {
    project: ProjectItem
    isActive: boolean
    /** When true, show a subtle indicator instead of the full active bar (e.g. home context) */
    isSubdued?: boolean
    onSelect: (id: string) => void
}) {
    const [hovered, setHovered] = React.useState(false)

    return (
        <div style={styles.avatarWrap}>
            {isActive && <span data-active-indicator style={isSubdued ? styles.ghostIndicator : styles.activeIndicator} />}
            <button
                type="button"
                aria-label={project.name}
                title={project.name}
                aria-current={isActive ? 'true' : undefined}
                data-project-id={project.id}
                onClick={() => onSelect(project.id)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    ...styles.avatarButton,
                    background: avatarColorFromId(project.id),
                    opacity: hovered && !isActive ? 0.85 : 1,
                }}
            >
                {project.icon ?? getInitial(project.name)}
            </button>
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
    className,
    style,
    ...props
}: ProjectSwitcherRailProps & React.HTMLAttributes<HTMLDivElement>) {
    const showHomeButton = isHomeSidebarEnabled() && onHomeClick
    const [homeHovered, setHomeHovered] = React.useState(false)

    return (
        <div
            className={clsx('nous-project-switcher-rail', className)}
            data-shell-component="project-switcher-rail"
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

            {showHomeButton && projects.length > 0 && (
                <span data-rail-divider style={styles.divider} />
            )}

            <div style={styles.projectList}>
                {projects.map((project) => (
                    <ProjectAvatar
                        key={project.id}
                        project={project}
                        isActive={project.id === activeProjectId}
                        isSubdued={isHomeActive}
                        onSelect={onProjectSelect}
                    />
                ))}
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
} as const
