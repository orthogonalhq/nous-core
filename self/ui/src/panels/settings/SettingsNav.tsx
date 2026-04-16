'use client'

import { useState } from 'react'
import type { SettingsCategory, SettingsNavProps } from './types'

const navContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: 'var(--nous-space-2xl)',
  gap: 'var(--nous-space-lg)',
  overflow: 'auto',
}

const categoryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--nous-space-xs) var(--nous-space-sm)',
  fontSize: 'var(--nous-font-size-sm)',
  fontFamily: 'var(--nous-font-family-mono)',
  fontWeight: 600,
  color: 'var(--nous-text-ghost)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left' as const,
}

const pageItemStyle = (isActive: boolean, isHovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: 'var(--nous-space-sm)',
  fontSize: 'var(--nous-font-size-md)',
  fontFamily: 'var(--nous-font-family)',
  color: isActive ? 'var(--nous-text-primary)' : 'var(--nous-text-secondary)',
  background: isActive
    ? 'var(--nous-bg-active)'
    : isHovered
      ? 'var(--nous-bg-hover)'
      : 'transparent',
  borderRadius: 'var(--nous-radius-md)',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left' as const,
})

const itemsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-2xs)',
}

function SettingsPageItem({
  label,
  isActive,
  onClick,
  testId,
}: {
  label: string
  isActive: boolean
  onClick: () => void
  testId: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      style={pageItemStyle(isActive, hovered)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={testId}
      data-active={isActive ? 'true' : undefined}
    >
      {label}
    </button>
  )
}

export function SettingsNav({ categories, activePageId, onPageSelect }: SettingsNavProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const category of categories) {
      initial[category.id] = category.defaultExpanded !== false
    }
    return initial
  })

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }))
  }

  return (
    <nav style={navContainerStyle} data-testid="settings-nav">
      {categories.map((category) => (
        <div key={category.id}>
          <button
            type="button"
            style={categoryHeaderStyle}
            onClick={() => toggleCategory(category.id)}
            data-testid={`category-${category.id}`}
          >
            <span>{category.label}</span>
            <span style={{
              display: 'inline-flex',
              transition: 'transform 0.15s ease',
              transform: expandedCategories[category.id] ? 'rotate(0deg)' : 'rotate(-90deg)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-text-ghost)',
            }}>
              ▾
            </span>
          </button>
          {expandedCategories[category.id] && category.children && (
            <div style={itemsContainerStyle}>
              {category.children.map((page) => (
                <SettingsPageItem
                  key={page.id}
                  label={page.label}
                  isActive={page.id === activePageId}
                  onClick={() => onPageSelect(page.id)}
                  testId={`page-${page.id}`}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
