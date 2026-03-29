import type { CommandGroup } from '@nous/ui/components'

export function buildWebCommands(callbacks: {
  navigate: (routeId: string) => void
  onModeToggle: () => void
  onCommandPalette: () => void
}): CommandGroup[] {
  return [
    {
      id: 'navigation',
      label: 'Navigation',
      commands: [
        { id: 'nav-home', label: 'Go to Home', action: () => callbacks.navigate('home') },
        { id: 'nav-threads', label: 'Go to Threads', action: () => callbacks.navigate('threads') },
        { id: 'nav-workflows', label: 'Go to Workflows', action: () => callbacks.navigate('workflows') },
        { id: 'nav-skills', label: 'Go to Skills', action: () => callbacks.navigate('skills') },
        { id: 'nav-apps', label: 'Go to Apps', action: () => callbacks.navigate('apps') },
        { id: 'nav-settings', label: 'Go to Settings', action: () => callbacks.navigate('settings') },
      ],
    },
    {
      id: 'actions',
      label: 'Actions',
      commands: [
        { id: 'action-toggle-mode', label: 'Toggle Mode', shortcut: 'Ctrl+Shift+D', action: callbacks.onModeToggle },
        { id: 'action-command-palette', label: 'Open Command Palette', shortcut: 'Ctrl+K', action: callbacks.onCommandPalette },
      ],
    },
  ]
}
