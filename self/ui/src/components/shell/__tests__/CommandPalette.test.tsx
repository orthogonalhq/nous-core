// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../CommandPalette'
import type { CommandGroup } from '../types'

const sampleCommands: CommandGroup[] = [
  {
    id: 'navigation',
    label: 'Navigation',
    commands: [
      { id: 'go-home', label: 'Go Home', shortcut: 'Ctrl+H', action: vi.fn() },
      { id: 'go-settings', label: 'Open Settings', action: vi.fn() },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    commands: [
      { id: 'new-thread', label: 'New Thread', shortcut: 'Ctrl+N', action: vi.fn() },
      { id: 'search-files', label: 'Search Files', action: vi.fn() },
    ],
  },
]

function freshCommands(): CommandGroup[] {
  return sampleCommands.map((g) => ({
    ...g,
    commands: g.commands.map((c) => ({ ...c, action: vi.fn() })),
  }))
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  commands: sampleCommands,
}

describe('CommandPalette', () => {
  it('renders when isOpen is true and does not render when false', () => {
    const { rerender } = render(<CommandPalette {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeTruthy()

    rerender(<CommandPalette {...defaultProps} isOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape key triggers onClose', () => {
    const onClose = vi.fn()
    render(<CommandPalette {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('search input filters commands by label', () => {
    render(<CommandPalette {...defaultProps} />)
    const searchInput = screen.getByLabelText('Search commands')
    fireEvent.change(searchInput, { target: { value: 'thread' } })
    expect(screen.getByText(/New/)).toBeTruthy()
    expect(screen.queryByTestId('command-item-go-home')).toBeNull()
    expect(screen.queryByTestId('command-item-go-settings')).toBeNull()
  })

  it('keyboard navigation: ArrowDown moves selection', () => {
    render(<CommandPalette {...defaultProps} />)
    const dialog = screen.getByRole('dialog')

    // Initially first item is selected
    const firstItem = screen.getByTestId('command-item-go-home')
    expect(firstItem.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    const secondItem = screen.getByTestId('command-item-go-settings')
    expect(secondItem.getAttribute('aria-selected')).toBe('true')
  })

  it('keyboard navigation: ArrowUp moves selection', () => {
    render(<CommandPalette {...defaultProps} />)
    const dialog = screen.getByRole('dialog')

    // Move down first, then back up
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    fireEvent.keyDown(dialog, { key: 'ArrowUp' })
    const firstItem = screen.getByTestId('command-item-go-home')
    expect(firstItem.getAttribute('aria-selected')).toBe('true')
  })

  it('keyboard navigation: Enter executes selected command and closes', () => {
    const onClose = vi.fn()
    const cmds = freshCommands()
    render(<CommandPalette isOpen onClose={onClose} commands={cmds} />)

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Enter' })

    expect(cmds[0].commands[0].action).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('commands grouped by section with headers', () => {
    render(<CommandPalette {...defaultProps} />)
    const navGroup = screen.getByText('Navigation')
    const actionsGroup = screen.getByText('Actions')
    expect(navGroup).toBeTruthy()
    expect(actionsGroup).toBeTruthy()
  })

  it('fuzzy matching highlights correct characters', () => {
    render(<CommandPalette {...defaultProps} />)
    const searchInput = screen.getByLabelText('Search commands')
    fireEvent.change(searchInput, { target: { value: 'nt' } })

    // "New Thread" should match with 'N' and 't' highlighted
    // Find <mark> elements
    const marks = screen.getAllByRole('dialog')[0].querySelectorAll('mark')
    expect(marks.length).toBeGreaterThan(0)
  })

  it('click-outside triggers onClose', () => {
    const onClose = vi.fn()
    render(<CommandPalette isOpen onClose={onClose} commands={sampleCommands} />)

    // Click the backdrop
    fireEvent.click(screen.getByTestId('command-palette-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click inside palette does not trigger onClose', () => {
    const onClose = vi.fn()
    render(<CommandPalette isOpen onClose={onClose} commands={sampleCommands} />)

    // Click inside the dialog
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('empty search state when no commands match query', () => {
    render(<CommandPalette {...defaultProps} />)
    const searchInput = screen.getByLabelText('Search commands')
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } })
    expect(screen.getByText('No commands found')).toBeTruthy()
  })

  it('selectedIndex resets to 0 when search query changes', () => {
    render(<CommandPalette {...defaultProps} />)
    const dialog = screen.getByRole('dialog')

    // Move selection down
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })

    // Type a search query — selection should reset to 0
    const searchInput = screen.getByLabelText('Search commands')
    fireEvent.change(searchInput, { target: { value: 'Go' } })

    // First matching item should be selected
    const firstMatch = screen.getByTestId('command-item-go-home')
    expect(firstMatch.getAttribute('aria-selected')).toBe('true')
  })

  it('keyboard navigation wraps at boundaries', () => {
    render(<CommandPalette {...defaultProps} />)
    const dialog = screen.getByRole('dialog')

    // ArrowUp from first item should wrap to last
    fireEvent.keyDown(dialog, { key: 'ArrowUp' })
    const lastItem = screen.getByTestId('command-item-search-files')
    expect(lastItem.getAttribute('aria-selected')).toBe('true')

    // ArrowDown from last item should wrap to first
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    const firstItem = screen.getByTestId('command-item-go-home')
    expect(firstItem.getAttribute('aria-selected')).toBe('true')
  })

  it('Enter on empty result set is a no-op', () => {
    const onClose = vi.fn()
    render(<CommandPalette isOpen onClose={onClose} commands={sampleCommands} />)
    const searchInput = screen.getByLabelText('Search commands')
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } })

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    // onClose should not be called because there are no results to execute
    expect(onClose).not.toHaveBeenCalled()
  })

  it('empty commands array renders empty state', () => {
    render(<CommandPalette isOpen onClose={vi.fn()} commands={[]} />)
    expect(screen.getByText('No commands found')).toBeTruthy()
  })

  it('renders shortcut labels for commands that have them', () => {
    render(<CommandPalette {...defaultProps} />)
    expect(screen.getByText('Ctrl+H')).toBeTruthy()
    expect(screen.getByText('Ctrl+N')).toBeTruthy()
  })
})
