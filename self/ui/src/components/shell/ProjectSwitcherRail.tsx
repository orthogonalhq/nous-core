'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import type { ProjectItem, ProjectSwitcherRailProps } from './types'

const AVATAR_SIZE = 32

/**
 * Deterministic color from project ID.
 * Simple hash → hue in HSL space with fixed saturation and lightness.
 */
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

interface ProjectAvatarProps {
  project: ProjectItem
  isActive: boolean
  onSelect: (id: string) => void
}

function ProjectAvatar({ project, isActive, onSelect }: ProjectAvatarProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const bgColor = avatarColorFromId(project.id)

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {isActive && (
        <span
          data-active-indicator
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '3px',
            height: '20px',
            borderRadius: '0 2px 2px 0',
            background: 'var(--nous-accent)',
          }}
        />
      )}
      <button
        type="button"
        aria-label={project.name}
        title={project.name}
        aria-current={isActive ? 'true' : undefined}
        data-project-id={project.id}
        onClick={() => onSelect(project.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: 'var(--nous-radius-full, 50%)',
          border: '2px solid transparent',
          background: bgColor,
          color: 'var(--nous-fg-on-color)',
          fontSize: 'var(--nous-font-size-xs)',
          fontWeight: 'var(--nous-font-weight-medium, 500)',
          cursor: 'pointer',
          transition: 'var(--nous-hover-button-transition)',
          opacity: isHovered && !isActive ? 0.85 : 1,
          padding: 0,
          outline: 'none',
        }}
      >
        {project.icon ?? getInitial(project.name)}
      </button>
    </div>
  )
}

export function ProjectSwitcherRail({
  projects,
  activeProjectId,
  onProjectSelect,
  onNewProject,
  brandSlot,
  className,
  style,
  ...props
}: ProjectSwitcherRailProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('nous-project-switcher-rail', className)}
      data-shell-component="project-switcher-rail"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 'var(--nous-project-rail-width)',
        minWidth: 'var(--nous-project-rail-width)',
        height: '100%',
        padding: 'var(--nous-space-sm) 0',
        gap: 'var(--nous-space-sm)',
        background: 'var(--nous-rail-bg)',
        borderInlineEnd: '1px solid var(--nous-shell-column-border)',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      {brandSlot ? (
        <div
          data-rail-slot="brand"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            paddingBottom: 'var(--nous-space-sm)',
            borderBottom: '1px solid var(--nous-shell-column-border)',
          }}
        >
          {brandSlot}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--nous-space-sm)',
          flex: '1 1 0%',
          overflowY: 'auto',
          width: '100%',
        }}
      >
        {projects.map((project) => (
          <ProjectAvatar
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            onSelect={onProjectSelect}
          />
        ))}
      </div>

      {onNewProject ? (
        <button
          type="button"
          aria-label="New project"
          data-rail-action="new-project"
          onClick={onNewProject}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: 'var(--nous-radius-full, 50%)',
            border: '1px dashed var(--nous-shell-column-border)',
            background: 'transparent',
            color: 'var(--nous-text-secondary)',
            fontSize: 'var(--nous-font-size-sm)',
            cursor: 'pointer',
            padding: 0,
            transition: 'var(--nous-hover-button-transition)',
          }}
        >
          <Plus size={14} />
        </button>
      ) : null}
    </div>
  )
}
