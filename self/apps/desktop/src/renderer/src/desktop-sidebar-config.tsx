import type { SidebarTopNavItem, AssetSection } from '@nous/ui/components'
import {
  STUB_CAMPAIGNS,
  STUB_TASKS,
  STUB_TEAMS,
  STUB_AGENTS,
} from '@nous/ui'
import { Network, LayoutDashboard, Inbox } from 'lucide-react'

// --- Top nav items (static) ---

export const DESKTOP_TOP_NAV: SidebarTopNavItem[] = [
  { id: 'org-chart', label: 'Organization Chart', icon: <Network size={16} />, routeId: 'org-chart' },
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, routeId: 'dashboard' },
  { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} />, routeId: 'inbox' },
]

// --- Sidebar sections ---

/**
 * Build sidebar sections for the desktop app.
 * CAMPAIGNS uses stub data for now (tRPC wiring deferred to WR-108).
 */
export function buildDesktopSidebarSections(): AssetSection[] {
  return [
    {
      id: 'campaigns',
      label: 'CAMPAIGNS',
      items: STUB_CAMPAIGNS.map((item) => ({
        ...item,
        indicatorColor: '#4CAF50',
      })),
      collapsible: true,
      disabled: false,
      onAdd: () => {},
    },
    {
      id: 'tasks',
      label: 'TASKS',
      items: STUB_TASKS.map((item) => ({
        ...item,
        indicatorColor: '#E91E63',
      })),
      collapsible: true,
      disabled: false,
      onAdd: () => {},
    },
    {
      id: 'teams',
      label: 'TEAMS',
      items: STUB_TEAMS.map((item) => ({
        ...item,
        indicatorColor: '#7C4DFF',
      })),
      collapsible: true,
      disabled: false,
      onAdd: () => {},
    },
    {
      id: 'agents',
      label: 'AGENTS',
      items: STUB_AGENTS.map((item) => ({
        ...item,
        indicatorColor: '#009688',
      })),
      collapsible: true,
      disabled: false,
      onAdd: () => {},
    },
  ]
}
