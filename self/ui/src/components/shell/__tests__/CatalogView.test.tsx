// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CatalogView } from '../CatalogView'
import type { CatalogItem, CatalogSortOption, CatalogFilterGroup } from '../types'

const sampleItems: CatalogItem[] = [
  { id: 'item-1', title: 'Alpha Widget', description: 'First item description', metadata: { category: 'tools' } },
  { id: 'item-2', title: 'Beta Service', description: 'Second item description', metadata: { category: 'services' } },
  { id: 'item-3', title: 'Gamma Tool', description: 'Third item description', metadata: { category: 'tools' } },
]

const defaultProps = {
  navigate: vi.fn(),
  goBack: vi.fn(),
  canGoBack: false,
  items: sampleItems,
}

describe('CatalogView', () => {
  it('renders items in grid mode by default', () => {
    render(<CatalogView {...defaultProps} />)
    expect(screen.getByText('Alpha Widget')).toBeTruthy()
    expect(screen.getByText('Beta Service')).toBeTruthy()
    expect(screen.getByText('Gamma Tool')).toBeTruthy()
    // Grid mode is the default — verify data attribute
    const container = screen.getByText('Alpha Widget').closest('[data-view-mode]')
    expect(container?.getAttribute('data-view-mode')).toBe('grid')
  })

  it('toggles between grid and list modes', () => {
    render(<CatalogView {...defaultProps} />)
    const listBtn = screen.getByLabelText('List view')
    fireEvent.click(listBtn)
    const container = screen.getByText('Alpha Widget').closest('[data-view-mode]')
    expect(container?.getAttribute('data-view-mode')).toBe('list')

    const gridBtn = screen.getByLabelText('Grid view')
    fireEvent.click(gridBtn)
    expect(container?.getAttribute('data-view-mode')).toBe('grid')
  })

  it('search input filters items by title', () => {
    render(<CatalogView {...defaultProps} />)
    const searchInput = screen.getByLabelText('Search catalog')
    fireEvent.change(searchInput, { target: { value: 'alpha' } })
    expect(screen.getByText('Alpha Widget')).toBeTruthy()
    expect(screen.queryByText('Beta Service')).toBeNull()
    expect(screen.queryByText('Gamma Tool')).toBeNull()
  })

  it('search input filters items by description', () => {
    render(<CatalogView {...defaultProps} />)
    const searchInput = screen.getByLabelText('Search catalog')
    fireEvent.change(searchInput, { target: { value: 'Second item' } })
    expect(screen.getByText('Beta Service')).toBeTruthy()
    expect(screen.queryByText('Alpha Widget')).toBeNull()
  })

  it('sort controls reorder items', () => {
    const sortOptions: CatalogSortOption[] = [
      {
        id: 'alpha-asc',
        label: 'A to Z',
        comparator: (a, b) => a.title.localeCompare(b.title),
      },
      {
        id: 'alpha-desc',
        label: 'Z to A',
        comparator: (a, b) => b.title.localeCompare(a.title),
      },
    ]

    render(<CatalogView {...defaultProps} sortOptions={sortOptions} />)
    const sortSelect = screen.getByLabelText('Sort by')

    // Default sort (A to Z) — first item should be Alpha
    const allItems = () => screen.getAllByText(/Widget|Service|Tool/)
    expect(allItems()[0].textContent).toBe('Alpha Widget')

    // Switch to Z to A
    fireEvent.change(sortSelect, { target: { value: 'alpha-desc' } })
    expect(allItems()[0].textContent).toBe('Gamma Tool')
  })

  it('filter controls show/hide items by category', () => {
    const filterGroups: CatalogFilterGroup[] = [
      {
        id: 'category',
        label: 'Category',
        options: [
          { id: 'tools', label: 'Tools' },
          { id: 'services', label: 'Services' },
        ],
      },
    ]

    render(<CatalogView {...defaultProps} filterGroups={filterGroups} />)

    // Click the "Tools" filter button
    fireEvent.click(screen.getByText('Tools'))
    expect(screen.getByText('Alpha Widget')).toBeTruthy()
    expect(screen.getByText('Gamma Tool')).toBeTruthy()
    expect(screen.queryByText('Beta Service')).toBeNull()

    // Click "Tools" again to deactivate, then "Services"
    fireEvent.click(screen.getByText('Tools'))
    fireEvent.click(screen.getByText('Services'))
    expect(screen.getByText('Beta Service')).toBeTruthy()
    expect(screen.queryByText('Alpha Widget')).toBeNull()
  })

  it('empty state renders when no items match search/filter criteria', () => {
    render(<CatalogView {...defaultProps} />)
    const searchInput = screen.getByLabelText('Search catalog')
    fireEvent.change(searchInput, { target: { value: 'nonexistent query xyz' } })
    expect(screen.getByText('No items found')).toBeTruthy()
  })

  it('renders custom empty message', () => {
    render(
      <CatalogView {...defaultProps} items={[]} emptyMessage="Nothing here" />,
    )
    expect(screen.getByText('Nothing here')).toBeTruthy()
  })

  it('loading state renders when loading prop is true', () => {
    render(<CatalogView {...defaultProps} loading />)
    expect(screen.getByText('Loading...')).toBeTruthy()
    expect(screen.queryByText('Alpha Widget')).toBeNull()
  })

  it('item click invokes handler with correct item', () => {
    const onItemClick = vi.fn()
    render(<CatalogView {...defaultProps} onItemClick={onItemClick} />)
    fireEvent.click(screen.getByTestId('catalog-item-item-2'))
    expect(onItemClick).toHaveBeenCalledWith(sampleItems[1])
  })

  it('accepts ContentRouterRenderProps without errors', () => {
    const navigate = vi.fn()
    const goBack = vi.fn()
    render(
      <CatalogView
        navigate={navigate}
        goBack={goBack}
        canGoBack={true}
        items={sampleItems}
      />,
    )
    expect(screen.getByText('Alpha Widget')).toBeTruthy()
  })

  it('view toggle persists across re-renders', () => {
    const { rerender } = render(<CatalogView {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('List view'))

    // Re-render with new items — view mode should still be list
    rerender(
      <CatalogView
        {...defaultProps}
        items={[...sampleItems, { id: 'item-4', title: 'Delta App' }]}
      />,
    )
    const container = screen.getByText('Alpha Widget').closest('[data-view-mode]')
    expect(container?.getAttribute('data-view-mode')).toBe('list')
  })

  it('empty items array renders empty state', () => {
    render(<CatalogView {...defaultProps} items={[]} />)
    expect(screen.getByText('No items found')).toBeTruthy()
  })

  it('items with no metadata field render correctly', () => {
    const itemsNoMeta: CatalogItem[] = [
      { id: 'x', title: 'No Meta Item' },
    ]
    render(<CatalogView {...defaultProps} items={itemsNoMeta} />)
    expect(screen.getByText('No Meta Item')).toBeTruthy()
  })

  it('filter across multiple groups applies AND logic', () => {
    const itemsWithTwoMeta: CatalogItem[] = [
      { id: 'a', title: 'Item A', metadata: { type: 'widget', status: 'active' } },
      { id: 'b', title: 'Item B', metadata: { type: 'widget', status: 'inactive' } },
      { id: 'c', title: 'Item C', metadata: { type: 'service', status: 'active' } },
    ]
    const filterGroups: CatalogFilterGroup[] = [
      { id: 'type', label: 'Type', options: [{ id: 'widget', label: 'Widget' }] },
      { id: 'status', label: 'Status', options: [{ id: 'active', label: 'Active' }] },
    ]

    render(
      <CatalogView
        {...defaultProps}
        items={itemsWithTwoMeta}
        filterGroups={filterGroups}
      />,
    )

    // Activate both filters
    fireEvent.click(screen.getByText('Widget'))
    fireEvent.click(screen.getByText('Active'))

    // Only Item A matches both type=widget AND status=active
    expect(screen.getByText('Item A')).toBeTruthy()
    expect(screen.queryByText('Item B')).toBeNull()
    expect(screen.queryByText('Item C')).toBeNull()
  })

  it('multiple filters within same group applies OR logic', () => {
    const filterGroups: CatalogFilterGroup[] = [
      {
        id: 'category',
        label: 'Category',
        options: [
          { id: 'tools', label: 'Tools' },
          { id: 'services', label: 'Services' },
        ],
      },
    ]

    render(<CatalogView {...defaultProps} filterGroups={filterGroups} />)

    // Activate both "Tools" and "Services" in the same group
    fireEvent.click(screen.getByText('Tools'))
    fireEvent.click(screen.getByText('Services'))

    // All items should match (OR logic within group)
    expect(screen.getByText('Alpha Widget')).toBeTruthy()
    expect(screen.getByText('Beta Service')).toBeTruthy()
    expect(screen.getByText('Gamma Tool')).toBeTruthy()
  })
})
