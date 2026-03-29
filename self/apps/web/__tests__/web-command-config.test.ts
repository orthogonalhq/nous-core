import { describe, it, expect, vi } from 'vitest'
import { buildWebCommands } from '@/components/shell/web-command-config'

describe('buildWebCommands', () => {
  const mockCallbacks = {
    navigate: vi.fn(),
    onModeToggle: vi.fn(),
    onCommandPalette: vi.fn(),
  }

  it('returns array of CommandGroup', () => {
    const groups = buildWebCommands(mockCallbacks)
    expect(Array.isArray(groups)).toBe(true)
    expect(groups.length).toBeGreaterThan(0)
  })

  it('Navigation group has 6 commands matching desktop', () => {
    const groups = buildWebCommands(mockCallbacks)
    const navGroup = groups.find((g) => g.id === 'navigation')
    expect(navGroup).toBeDefined()
    expect(navGroup!.commands.length).toBe(6)
  })

  it('Navigation command IDs match desktop', () => {
    const groups = buildWebCommands(mockCallbacks)
    const navGroup = groups.find((g) => g.id === 'navigation')!
    const ids = navGroup.commands.map((c) => c.id)
    expect(ids).toEqual(['nav-home', 'nav-threads', 'nav-workflows', 'nav-skills', 'nav-apps', 'nav-settings'])
  })

  it('Actions group has 2 commands', () => {
    const groups = buildWebCommands(mockCallbacks)
    const actionsGroup = groups.find((g) => g.id === 'actions')
    expect(actionsGroup).toBeDefined()
    expect(actionsGroup!.commands.length).toBe(2)
  })

  it('each command has id, label, and action (typeof function)', () => {
    const groups = buildWebCommands(mockCallbacks)
    for (const group of groups) {
      for (const cmd of group.commands) {
        expect(typeof cmd.id).toBe('string')
        expect(cmd.id.length).toBeGreaterThan(0)
        expect(typeof cmd.label).toBe('string')
        expect(cmd.label.length).toBeGreaterThan(0)
        expect(typeof cmd.action).toBe('function')
      }
    }
  })

  it('Toggle Mode command has shortcut Ctrl+Shift+D', () => {
    const groups = buildWebCommands(mockCallbacks)
    const actionsGroup = groups.find((g) => g.id === 'actions')
    const toggleMode = actionsGroup!.commands.find((c) => c.id === 'action-toggle-mode')
    expect(toggleMode).toBeDefined()
    expect(toggleMode!.shortcut).toBe('Ctrl+Shift+D')
  })

  it('Open Command Palette command has shortcut Ctrl+K', () => {
    const groups = buildWebCommands(mockCallbacks)
    const actionsGroup = groups.find((g) => g.id === 'actions')
    const paletteCmd = actionsGroup!.commands.find((c) => c.id === 'action-command-palette')
    expect(paletteCmd).toBeDefined()
    expect(paletteCmd!.shortcut).toBe('Ctrl+K')
  })

  it('navigation actions call through to provided navigate callback', () => {
    const navigate = vi.fn()
    const groups = buildWebCommands({ navigate, onModeToggle: vi.fn(), onCommandPalette: vi.fn() })
    const navGroup = groups.find((g) => g.id === 'navigation')!
    const homeCmd = navGroup.commands.find((c) => c.id === 'nav-home')!
    homeCmd.action()
    expect(navigate).toHaveBeenCalledWith('home')
  })

  it('toggle mode action calls through to provided onModeToggle callback', () => {
    const onModeToggle = vi.fn()
    const groups = buildWebCommands({ navigate: vi.fn(), onModeToggle, onCommandPalette: vi.fn() })
    const actionsGroup = groups.find((g) => g.id === 'actions')!
    const toggleCmd = actionsGroup.commands.find((c) => c.id === 'action-toggle-mode')!
    toggleCmd.action()
    expect(onModeToggle).toHaveBeenCalledOnce()
  })

  it('command palette action calls through to provided onCommandPalette callback', () => {
    const onCommandPalette = vi.fn()
    const groups = buildWebCommands({ navigate: vi.fn(), onModeToggle: vi.fn(), onCommandPalette })
    const actionsGroup = groups.find((g) => g.id === 'actions')!
    const paletteCmd = actionsGroup.commands.find((c) => c.id === 'action-command-palette')!
    paletteCmd.action()
    expect(onCommandPalette).toHaveBeenCalledOnce()
  })
})
