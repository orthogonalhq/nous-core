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
  { id: 'org-chart', label: 'Organization Chart', icon: <Network />, routeId: 'org-chart' },
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, routeId: 'dashboard' },
  { id: 'inbox', label: 'Inbox', icon: <Inbox />, routeId: 'inbox', badge: true },
]

// --- Sidebar sections ---

/**
 * Build sidebar sections for the desktop app.
 * CAMPAIGNS uses stub data for now (tRPC wiring deferred to WR-108).
 */
export function buildDesktopSidebarSections(): AssetSection[] {
  return [
    {
      id: 'workflows',
      label: 'WORKFLOWS',
      items: STUB_CAMPAIGNS,
      collapsible: true,
      disabled: false,
      onAdd: () => {},
      onSettings: () => {},
    },
    {
      id: 'tasks',
      label: 'TASKS',
      items: STUB_TASKS,
      collapsible: true,
      disabled: false,
      onAdd: () => {},
      onSettings: () => {},
    },
    {
      id: 'teams',
      label: 'TEAMS',
      items: STUB_TEAMS,
      collapsible: true,
      disabled: false,
      onAdd: () => {},
      onSettings: () => {},
    },
    {
      id: 'agents',
      label: 'AGENTS',
      items: STUB_AGENTS,
      collapsible: true,
      disabled: false,
      onAdd: () => {},
      onSettings: () => {},
    },
  ]
}
