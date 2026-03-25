'use client'

import { useState, useMemo, useCallback } from 'react'
import { clsx } from 'clsx'
import type { CatalogViewProps, CatalogItem } from './types'

/**
 * Generic, reusable catalog surface that renders items in grid or list mode
 * with client-side search, sort, and filter capabilities.
 *
 * Accepts `ContentRouterRenderProps` for navigation integration.
 * Runtime-agnostic — no Electron imports, no IPC.
 */
export function CatalogView(props: CatalogViewProps) {
  const {
    items,
    loading,
    onItemClick,
    sortOptions,
    filterGroups,
    defaultViewMode = 'grid',
    emptyMessage = 'No items found',
    className,
  } = props

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(defaultViewMode)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSort, setActiveSort] = useState<string | null>(
    sortOptions?.[0]?.id ?? null,
  )
  const [activeFilters, setActiveFilters] = useState<Map<string, Set<string>>>(
    () => new Map(),
  )

  const toggleFilter = useCallback((groupId: string, optionId: string) => {
    setActiveFilters((prev) => {
      const next = new Map(prev)
      const groupSet = new Set(next.get(groupId) ?? [])
      if (groupSet.has(optionId)) {
        groupSet.delete(optionId)
      } else {
        groupSet.add(optionId)
      }
      if (groupSet.size === 0) {
        next.delete(groupId)
      } else {
        next.set(groupId, groupSet)
      }
      return next
    })
  }, [])

  const filteredItems = useMemo(() => {
    let result = items

    // 1. Filter by search query (case-insensitive substring)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.description?.toLowerCase().includes(query) ?? false),
      )
    }

    // 2. Filter by active category filters (OR within group, AND across groups)
    if (activeFilters.size > 0) {
      result = result.filter((item) => {
        for (const [groupId, selectedOptions] of activeFilters) {
          const matchesGroup = Array.from(selectedOptions).some((optionId) => {
            // Match against metadata values for the group ID key
            return item.metadata?.[groupId] === optionId
          })
          if (!matchesGroup) return false
        }
        return true
      })
    }

    // 3. Sort by active sort comparator
    if (activeSort && sortOptions) {
      const sortOption = sortOptions.find((s) => s.id === activeSort)
      if (sortOption) {
        result = [...result].sort(sortOption.comparator)
      }
    }

    return result
  }, [items, searchQuery, activeFilters, activeSort, sortOptions])

  if (loading) {
    return (
      <div
        className={clsx('nous-catalog-view', className)}
        role="status"
        aria-label="Loading catalog"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-base)',
        }}
      >
        Loading...
      </div>
    )
  }

  return (
    <div
      className={clsx('nous-catalog-view', className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 'var(--nous-space-lg)',
        padding: 'var(--nous-space-2xl)',
        color: 'var(--nous-fg)',
      }}
    >
      {/* Toolbar: search, view toggle, sort */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--nous-space-md)',
          flexWrap: 'wrap',
        }}
      >
        {/* Search input */}
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search catalog"
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            background: 'var(--nous-input-bg)',
            border: '1px solid var(--nous-input-border)',
            borderRadius: 'var(--nous-input-radius)',
            padding: 'var(--nous-space-sm) var(--nous-space-md)',
            color: 'var(--nous-input-fg)',
            fontSize: 'var(--nous-font-size-base)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 'var(--nous-space-xs)' }}>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            style={{
              background:
                viewMode === 'grid'
                  ? 'var(--nous-bg-active)'
                  : 'transparent',
              border: '1px solid var(--nous-border-subtle)',
              borderRadius: 'var(--nous-radius-sm)',
              padding: 'var(--nous-space-xs) var(--nous-space-sm)',
              color: 'var(--nous-fg)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            style={{
              background:
                viewMode === 'list'
                  ? 'var(--nous-bg-active)'
                  : 'transparent',
              border: '1px solid var(--nous-border-subtle)',
              borderRadius: 'var(--nous-radius-sm)',
              padding: 'var(--nous-space-xs) var(--nous-space-sm)',
              color: 'var(--nous-fg)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            List
          </button>
        </div>

        {/* Sort controls */}
        {sortOptions && sortOptions.length > 0 ? (
          <select
            value={activeSort ?? ''}
            onChange={(e) => setActiveSort(e.target.value || null)}
            aria-label="Sort by"
            style={{
              background: 'var(--nous-input-bg)',
              border: '1px solid var(--nous-input-border)',
              borderRadius: 'var(--nous-input-radius)',
              padding: 'var(--nous-space-xs) var(--nous-space-sm)',
              color: 'var(--nous-input-fg)',
              fontSize: 'var(--nous-font-size-sm)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {sortOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Filter controls */}
      {filterGroups && filterGroups.length > 0 ? (
        <div
          style={{
            display: 'flex',
            gap: 'var(--nous-space-lg)',
            flexWrap: 'wrap',
          }}
        >
          {filterGroups.map((group) => (
            <div key={group.id}>
              <span
                style={{
                  fontSize: 'var(--nous-font-size-xs)',
                  color: 'var(--nous-fg-muted)',
                  textTransform: 'uppercase',
                  marginRight: 'var(--nous-space-sm)',
                }}
              >
                {group.label}:
              </span>
              {group.options.map((option) => {
                const isActive =
                  activeFilters.get(group.id)?.has(option.id) ?? false
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleFilter(group.id, option.id)}
                    aria-pressed={isActive}
                    style={{
                      background: isActive
                        ? 'var(--nous-bg-active)'
                        : 'transparent',
                      border: '1px solid var(--nous-border-subtle)',
                      borderRadius: 'var(--nous-badge-radius)',
                      padding: 'var(--nous-space-2xs) var(--nous-space-sm)',
                      color: 'var(--nous-fg)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 'var(--nous-font-size-xs)',
                      marginLeft: 'var(--nous-space-xs)',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}

      {/* Items */}
      {filteredItems.length === 0 ? (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            color: 'var(--nous-fg-muted)',
            fontSize: 'var(--nous-font-size-base)',
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          data-view-mode={viewMode}
          style={{
            display: viewMode === 'grid' ? 'grid' : 'flex',
            gridTemplateColumns:
              viewMode === 'grid'
                ? 'repeat(auto-fill, minmax(200px, 1fr))'
                : undefined,
            flexDirection: viewMode === 'list' ? 'column' : undefined,
            gap: 'var(--nous-space-md)',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {filteredItems.map((item) => (
            <CatalogCard
              key={item.id}
              item={item}
              viewMode={viewMode}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogCard({
  item,
  viewMode,
  onClick,
}: {
  item: CatalogItem
  viewMode: 'grid' | 'list'
  onClick?: (item: CatalogItem) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(item)
        }
      }}
      data-testid={`catalog-item-${item.id}`}
      style={{
        display: viewMode === 'list' ? 'flex' : 'block',
        alignItems: viewMode === 'list' ? 'center' : undefined,
        gap: viewMode === 'list' ? 'var(--nous-space-md)' : undefined,
        background: 'var(--nous-catalog-card-bg)',
        borderRadius: 'var(--nous-card-radius)',
        padding: 'var(--nous-space-lg)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--nous-hover-button-transition)',
      }}
    >
      {item.icon ? (
        <span
          style={{
            fontSize: 'var(--nous-font-size-xl)',
            marginBottom:
              viewMode === 'grid' ? 'var(--nous-space-sm)' : undefined,
            display: viewMode === 'grid' ? 'block' : 'inline',
          }}
        >
          {item.icon}
        </span>
      ) : null}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--nous-font-size-base)',
            fontWeight: 500,
            color: 'var(--nous-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        {item.description ? (
          <div
            style={{
              fontSize: 'var(--nous-font-size-sm)',
              color: 'var(--nous-fg-muted)',
              marginTop: 'var(--nous-space-2xs)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.description}
          </div>
        ) : null}
      </div>
    </div>
  )
}
