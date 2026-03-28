import type { RailSection } from '@nous/ui/components'

export const RAIL_SECTIONS: RailSection[] = [
  {
    id: 'main',
    label: 'Navigate',
    items: [
      { id: 'home', label: 'Home', icon: 'H' },
      { id: 'threads', label: 'Threads', icon: 'T' },
      { id: 'workflows', label: 'Workflows', icon: 'W' },
      { id: 'skills', label: 'Skills', icon: 'S' },
      { id: 'apps', label: 'Apps', icon: 'A' },
      { id: 'settings', label: 'Settings', icon: 'P' },
    ],
  },
]
