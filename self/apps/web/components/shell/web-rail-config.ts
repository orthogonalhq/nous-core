import type { RailSection } from '@nous/ui/components'

export const webRailSections: RailSection[] = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { id: 'home', label: 'Home', icon: 'H' },
      { id: 'chat', label: 'Chat', icon: 'C' },
      { id: 'projects', label: 'Projects', icon: 'P' },
      { id: 'mao', label: 'MAO', icon: 'M' },
    ],
  },
  {
    id: 'discover',
    label: 'Discover',
    items: [
      { id: 'marketplace', label: 'Marketplace', icon: 'K' },
      { id: 'traces', label: 'Traces', icon: 'R' },
      { id: 'memory', label: 'Memory', icon: 'Y' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    collapsible: true,
    items: [
      { id: 'config', label: 'Configuration', icon: 'G' },
      { id: 'settings', label: 'Settings', icon: 'S' },
    ],
  },
]
