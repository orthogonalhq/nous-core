'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import type {
  AssetSection,
  AssetSectionItem,
  AssetSidebarProps,
  ChatStage,
  SidebarTopNavItem,
} from './types'

const COLLAPSE_KEY_PREFIX = 'nous-sidebar-collapse-'

function readCollapseState(sectionId: string, defaultCollapsed: boolean): boolean {
  try {
    const stored = localStorage.getItem(`${COLLAPSE_KEY_PREFIX}${sectionId}`)
    if (stored !== null) return stored === 'true'
  } catch {
    // localStorage unavailable
  }
  return defaultCollapsed
}

function writeCollapseState(sectionId: string, collapsed: boolean): void {
  try {
    localStorage.setItem(`${COLLAPSE_KEY_PREFIX}${sectionId}`, String(collapsed))
  } catch {
    // localStorage unavailable
  }
}

// --- Sub-components ---

interface TopNavItemRowProps {
  item: SidebarTopNavItem
  isActive: boolean
  onNavigate: (routeId: string) => void
}

function TopNavItemRow({ item, isActive, onNavigate }: TopNavItemRowProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <button
      type="button"
      data-nav-item={item.id}
      data-state={isActive ? 'active' : 'inactive'}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onNavigate(item.routeId)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-sm)',
        width: '100%',
        border: 'none',
        borderRadius: 'var(--nous-radius-md)',
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
        background: isActive
          ? 'var(--nous-bg-active)'
          : isHovered
            ? 'var(--nous-bg-hover)'
            : 'transparent',
        color: isActive ? 'var(--nous-text-primary)' : 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-sm)',
        cursor: 'pointer',
        transition: 'var(--nous-hover-button-transition)',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </button>
  )
}

interface SectionHeaderProps {
  section: AssetSection
  isCollapsed: boolean
  onToggleCollapse: () => void
}

function SectionHeader({ section, isCollapsed, onToggleCollapse }: SectionHeaderProps) {
  return (
    <div
      data-section-header={section.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
        opacity: section.disabled ? 0.4 : 1,
      }}
    >
      <button
        type="button"
        aria-expanded={!isCollapsed}
        onClick={section.collapsible && !section.disabled ? onToggleCollapse : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-xs)',
          border: 'none',
          background: 'transparent',
          color: 'var(--nous-text-secondary)',
          fontSize: 'var(--nous-font-size-xs)',
          fontWeight: 'var(--nous-font-weight-medium, 500)',
          textTransform: 'uppercase',
          cursor: section.collapsible && !section.disabled ? 'pointer' : 'default',
          padding: 0,
          pointerEvents: section.disabled ? 'none' : 'auto',
        }}
      >
        {section.collapsible ? (
          <span
            data-collapse-chevron
            style={{
              display: 'inline-block',
              transition: 'transform var(--nous-duration-fast, 150ms) var(--nous-ease-out, ease-out)',
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              fontSize: '10px',
            }}
          >
            &#x25BE;
          </span>
        ) : null}
        <span>{section.label}</span>
      </button>

      {!section.disabled ? (
        <div style={{ display: 'flex', gap: 'var(--nous-space-xs)' }}>
          {section.onSettings ? (
            <button
              type="button"
              aria-label={`${section.label} settings`}
              data-action="settings"
              onClick={section.onSettings}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--nous-text-tertiary)',
                cursor: 'pointer',
                padding: '2px',
                fontSize: 'var(--nous-font-size-xs)',
              }}
            >
              &#x2699;
            </button>
          ) : null}
          {section.onAdd ? (
            <button
              type="button"
              aria-label={`Add ${section.label}`}
              data-action="add"
              onClick={section.onAdd}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--nous-text-tertiary)',
                cursor: 'pointer',
                padding: '2px',
                fontSize: 'var(--nous-font-size-xs)',
              }}
            >
              +
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface SectionItemRowProps {
  item: AssetSectionItem
  isActive: boolean
  disabled: boolean
  onNavigate: (routeId: string) => void
}

function SectionItemRow({ item, isActive, disabled, onNavigate }: SectionItemRowProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <button
      type="button"
      data-section-item={item.id}
      data-state={isActive ? 'active' : 'inactive'}
      aria-current={isActive ? 'page' : undefined}
      disabled={disabled}
      onClick={() => !disabled && onNavigate(item.routeId)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-sm)',
        width: '100%',
        border: 'none',
        borderRadius: 'var(--nous-radius-md)',
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
        paddingLeft: 'var(--nous-space-lg, 24px)',
        background: isActive
          ? 'var(--nous-bg-active)'
          : isHovered && !disabled
            ? 'var(--nous-bg-hover)'
            : 'transparent',
        color: disabled
          ? 'var(--nous-text-tertiary)'
          : isActive
            ? 'var(--nous-text-primary)'
            : 'var(--nous-text-secondary)',
        fontSize: 'var(--nous-font-size-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'var(--nous-hover-button-transition)',
        textAlign: 'left',
      }}
    >
      {item.icon ? (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {item.icon}
        </span>
      ) : null}
      <span style={{ flex: '1 1 0%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {item.indicatorColor ? (
        <span
          data-indicator
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: item.indicatorColor,
            flexShrink: 0,
          }}
        />
      ) : null}
    </button>
  )
}

interface AssetSectionBlockProps {
  section: AssetSection
  activeRoute: string
  onNavigate: (routeId: string) => void
}

function AssetSectionBlock({ section, activeRoute, onNavigate }: AssetSectionBlockProps) {
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
      <SectionHeader
        section={section}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      {!isCollapsed ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
          }}
        >
          {section.items.map((item) => (
            <SectionItemRow
              key={item.id}
              item={item}
              isActive={item.routeId === activeRoute}
              disabled={!!section.disabled}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// --- Main component ---

export function AssetSidebar({
  projectName,
  topNav,
  sections,
  activeRoute,
  onNavigate,
  chatSlot,
  className,
  style,
  ...props
}: AssetSidebarProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'content'>) {
  const [chatStage, setChatStage] = React.useState<ChatStage>('ambient')

  const handleNavigate = (routeId: string) => {
    // Clicking any nav item collapses chat to ambient (per D4)
    setChatStage('ambient')
    onNavigate(routeId)
  }

  const handleStageChange = (stage: ChatStage) => {
    setChatStage(stage)
  }

  const showSections = chatStage !== 'full'

  // Chat height allocation per stage
  const chatFlexBasis =
    chatStage === 'ambient'
      ? '100px'
      : chatStage === 'peek'
        ? '45%'
        : '100%'

  return (
    <div
      className={clsx('nous-asset-sidebar', className)}
      data-shell-component="asset-sidebar"
      data-chat-stage={chatStage}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {/* Project header */}
      <div
        data-sidebar-slot="header"
        style={{
          padding: 'var(--nous-space-sm) var(--nous-space-md)',
          borderBottom: '1px solid var(--nous-shell-column-border)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            fontWeight: 'var(--nous-font-weight-medium, 500)',
            color: 'var(--nous-text-primary)',
          }}
        >
          {projectName}
        </span>
      </div>

      {/* Sections area — scrollable, shrinks when chat grows */}
      {showSections ? (
        <div
          data-sidebar-slot="sections"
          style={{
            flex: '1 1 0%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--nous-space-xs)',
            padding: 'var(--nous-space-sm) 0',
            minHeight: 0,
          }}
        >
          {/* Top nav items */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
              padding: '0 var(--nous-space-xs)',
            }}
          >
            {topNav.map((item) => (
              <TopNavItemRow
                key={item.id}
                item={item}
                isActive={item.routeId === activeRoute}
                onNavigate={handleNavigate}
              />
            ))}
          </div>

          {/* Asset sections */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--nous-space-xs)',
              padding: '0 var(--nous-space-xs)',
            }}
          >
            {sections.map((section) => (
              <AssetSectionBlock
                key={section.id}
                section={section}
                activeRoute={activeRoute}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Chat slot — bottom sheet */}
      <div
        data-sidebar-slot="chat"
        style={{
          flexShrink: 0,
          flexGrow: chatStage === 'full' ? 1 : 0,
          flexBasis: chatFlexBasis,
          minHeight: chatStage === 'ambient' ? '100px' : undefined,
          maxHeight: chatStage === 'full' ? '100%' : chatStage === 'peek' ? '50%' : undefined,
          borderTop: '1px solid var(--nous-shell-column-border)',
          overflow: 'hidden',
          transition: 'flex-basis var(--nous-duration-normal, 200ms) var(--nous-ease-out, ease-out)',
        }}
      >
        {chatSlot({ stage: chatStage, onStageChange: handleStageChange })}
      </div>
    </div>
  )
}
