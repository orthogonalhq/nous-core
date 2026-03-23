'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import * as React from 'react'
import { cn } from '../../lib/cn'
import type { ProjectItem, RailItem, RailSection } from './types'

const RAIL_ITEM_DIMENSION = 'calc(var(--nous-rail-width) - (var(--nous-space-sm) * 2))'
const PROJECT_NEW_ID = 'new-project'

function noop() {}

export interface NavigationRailProps
  extends React.HTMLAttributes<HTMLDivElement> {
  items: RailSection[]
  activeItemId: string
  onItemSelect: (id: string) => void
  projects?: ProjectItem[]
  onProjectSelect?: (id: string) => void
}

interface RailItemButtonProps {
  item: RailItem
  isActive: boolean
  onSelect: (id: string) => void
}

function RailItemButton({ item, isActive, onSelect }: RailItemButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={cn(
            'nous-rail-item-button flex items-center justify-center',
            isActive && 'is-active',
          )}
          data-state={isActive ? 'active' : 'inactive'}
          aria-label={item.label}
          disabled={item.disabled}
          onClick={() => onSelect(item.id)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            width: RAIL_ITEM_DIMENSION,
            minWidth: RAIL_ITEM_DIMENSION,
            minHeight: RAIL_ITEM_DIMENSION,
            border: 'none',
            borderRadius: 'var(--nous-radius-md)',
            padding: 'var(--nous-space-sm)',
            background: isActive
              ? 'var(--nous-rail-item-active-bg)'
              : isHovered
                ? 'var(--nous-rail-hover-bg)'
                : 'transparent',
            color: isActive ? 'var(--nous-text-primary)' : 'var(--nous-rail-fg)',
            transition: 'var(--nous-hover-button-transition)',
            cursor: item.disabled ? 'not-allowed' : 'pointer',
            opacity: item.disabled ? '0.55' : '1',
          }}
        >
          {item.icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={0}
          style={{
            marginInlineStart: 'var(--nous-space-sm)',
            borderRadius: 'var(--nous-radius-sm)',
            background: 'var(--nous-catalog-card-bg)',
            border: '1px solid var(--nous-shell-column-border)',
            color: 'var(--nous-text-primary)',
            padding: 'var(--nous-space-xs) var(--nous-space-sm)',
            fontSize: 'var(--nous-font-size-xs)',
            boxShadow: 'var(--nous-shadow-sm)',
            zIndex: 'var(--nous-z-dropdown)',
          }}
        >
          {item.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

interface RailSectionGroupProps {
  section: RailSection
  activeItemId: string
  onItemSelect: (id: string) => void
}

function RailSectionGroup({
  section,
  activeItemId,
  onItemSelect,
}: RailSectionGroupProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(
    section.defaultCollapsed ?? false,
  )

  return (
    <div
      className="nous-rail-section flex min-w-0 flex-col"
      style={{
        gap: 'var(--nous-space-xs)',
      }}
    >
      <button
        type="button"
        className={cn(
          'flex items-center justify-between text-left',
          !section.collapsible && 'pointer-events-none',
        )}
        aria-expanded={!isCollapsed}
        onClick={() => {
          if (section.collapsible) {
            setIsCollapsed((current) => !current)
          }
        }}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: 'var(--nous-rail-section-fg)',
          fontSize: 'var(--nous-font-size-xs)',
          fontWeight: 'var(--nous-font-weight-medium)',
          padding: '0 var(--nous-space-xs)',
          textTransform: 'uppercase',
          cursor: section.collapsible ? 'pointer' : 'default',
        }}
      >
        <span>{section.label}</span>
        {section.collapsible ? <span>{isCollapsed ? '+' : '-'}</span> : null}
      </button>

      {!isCollapsed ? (
        <div
          className="flex flex-col items-center"
          style={{
            gap: 'var(--nous-space-xs)',
          }}
        >
          {section.items.map((item) => (
            <RailItemButton
              key={item.id}
              item={item}
              isActive={item.id === activeItemId}
              onSelect={onItemSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface RailProjectEntryProps {
  project: ProjectItem
  onSelect: (id: string) => void
}

function RailProjectEntry({ project, onSelect }: RailProjectEntryProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <button
      type="button"
      className="nous-rail-project-entry flex min-w-0 items-center"
      onClick={() => onSelect(project.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        border: 'none',
        borderRadius: 'var(--nous-radius-md)',
        padding: 'var(--nous-space-sm)',
        background: isHovered ? 'var(--nous-rail-hover-bg)' : 'transparent',
        color: 'var(--nous-rail-fg)',
        cursor: 'pointer',
        transition: 'var(--nous-hover-button-transition)',
        gap: 'var(--nous-space-sm)',
      }}
    >
      <span className="flex items-center justify-center">{project.icon ?? '•'}</span>
      <span
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left"
        style={{
          fontSize: 'var(--nous-font-size-xs)',
          color: 'var(--nous-text-secondary)',
        }}
      >
        {project.name}
      </span>
    </button>
  )
}

interface NewProjectButtonProps {
  onSelect: (id: string) => void
}

function NewProjectButton({ onSelect }: NewProjectButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <button
      type="button"
      className="nous-new-project-button flex items-center justify-center"
      onClick={() => onSelect(PROJECT_NEW_ID)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        border: '1px dashed var(--nous-shell-column-border)',
        borderRadius: 'var(--nous-radius-md)',
        padding: 'var(--nous-space-sm)',
        background: isHovered ? 'var(--nous-rail-hover-bg)' : 'transparent',
        color: 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-xs)',
        cursor: 'pointer',
        transition: 'var(--nous-hover-button-transition)',
      }}
    >
      + New Project
    </button>
  )
}

export function NavigationRail({
  items,
  activeItemId,
  onItemSelect,
  projects = [],
  onProjectSelect = noop,
  className,
  style,
  ...props
}: NavigationRailProps) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <div
        className={cn(
          'nous-navigation-rail flex h-full min-w-0 flex-col',
          className,
        )}
        style={{
          width: 'var(--nous-rail-width)',
          minWidth: 'var(--nous-rail-width)',
          background: 'var(--nous-rail-bg)',
          color: 'var(--nous-rail-fg)',
          padding: 'var(--nous-space-sm)',
          gap: 'var(--nous-space-md)',
          borderInlineEnd: '1px solid var(--nous-shell-column-border)',
          boxSizing: 'border-box',
          ...style,
        }}
        {...props}
      >
        {projects.length > 0 ? (
          <div
            className="flex flex-col"
            style={{
              gap: 'var(--nous-space-xs)',
            }}
          >
            <div
              style={{
                color: 'var(--nous-rail-section-fg)',
                fontSize: 'var(--nous-font-size-xs)',
                fontWeight: 'var(--nous-font-weight-medium)',
                padding: '0 var(--nous-space-xs)',
                textTransform: 'uppercase',
              }}
            >
              Projects
            </div>
            {projects.map((project) => (
              <RailProjectEntry
                key={project.id}
                project={project}
                onSelect={onProjectSelect}
              />
            ))}
            <NewProjectButton onSelect={onProjectSelect} />
          </div>
        ) : null}

        <div
          className="flex min-w-0 flex-1 flex-col items-center"
          style={{
            gap: 'var(--nous-space-md)',
          }}
        >
          {items.map((section) => (
            <RailSectionGroup
              key={section.id}
              section={section}
              activeItemId={activeItemId}
              onItemSelect={onItemSelect}
            />
          ))}
        </div>
      </div>
    </Tooltip.Provider>
  )
}
