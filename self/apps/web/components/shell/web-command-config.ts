import type { CommandGroup } from '@nous/ui/components'

export function buildWebCommands(callbacks: {
  navigate: (routeId: string) => void
  onModeToggle: () => void
}): CommandGroup[] {
  const { navigate, onModeToggle } = callbacks

  return [
    {
      id: 'navigation',
      label: 'Navigation',
      commands: [
        { id: 'nav-home', label: 'Go to Home', action: () => navigate('home') },
        { id: 'nav-chat', label: 'Go to Chat', action: () => navigate('chat') },
        { id: 'nav-projects', label: 'Go to Projects', action: () => navigate('projects') },
        { id: 'nav-marketplace', label: 'Go to Marketplace', action: () => navigate('marketplace') },
        { id: 'nav-traces', label: 'Go to Traces', action: () => navigate('traces') },
        { id: 'nav-memory', label: 'Go to Memory', action: () => navigate('memory') },
        { id: 'nav-config', label: 'Go to Configuration', action: () => navigate('config') },
        { id: 'nav-settings', label: 'Go to Settings', action: () => navigate('settings') },
      ],
    },
    {
      id: 'actions',
      label: 'Actions',
      commands: [
        {
          id: 'toggle-mode',
          label: 'Toggle Mode',
          shortcut: 'Ctrl+Shift+D',
          action: onModeToggle,
        },
        {
          id: 'open-command-palette',
          label: 'Open Command Palette',
          shortcut: 'Ctrl+K',
          action: () => {
            /* handled by keyboard shortcut registration in SP 2 */
          },
        },
      ],
    },
  ]
}
