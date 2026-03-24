'use client'

import { useState } from 'react'
import type { SettingsCategory, SettingsNavProps } from './types'

const navContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: 'var(--nous-space-md)',
  gap: 'var(--nous-space-xs)',
  overflow: 'auto',
}

const categoryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-xs)',
  fontWeight: 'var(--nous-font-weight-semibold)' as never,
  color: 'var(--nous-fg-subtle)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left' as const,
}

const pageItemStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  padding: 'var(--nous-space-sm) var(--nous-space-lg)',
  fontSize: 'var(--nous-font-size-sm)',
  color: isActive ? 'var(--nous-fg)' : 'var(--nous-fg-muted)',
  background: isActive ? 'var(--nous-bg-elevated)' : 'transparent',
  borderRadius: 'var(--nous-radius-sm)',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left' as const,
  fontWeight: isActive ? ('var(--nous-font-weight-medium)' as never) : ('normal' as never),
})

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
            <span>{expandedCategories[category.id] ? '\u25B4' : '\u25BE'}</span>
          </button>
          {expandedCategories[category.id] && category.children && (
            <div>
              {category.children.map((page) => {
                const isActive = page.id === activePageId
                return (
                  <button
                    key={page.id}
                    type="button"
                    style={pageItemStyle(isActive)}
                    onClick={() => onPageSelect(page.id)}
                    data-testid={`page-${page.id}`}
                    data-active={isActive ? 'true' : undefined}
                  >
                    {page.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
