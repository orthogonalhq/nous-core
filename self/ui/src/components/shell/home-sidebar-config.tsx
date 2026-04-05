import {
  LayoutDashboard,
  Inbox,
  BarChart3,
  Store,
  Settings,
} from 'lucide-react'
import type { SidebarTopNavItem, AssetSection } from './types'

// --- Home sidebar top nav items ---

export const HOME_TOP_NAV: SidebarTopNavItem[] = [
  { id: 'home-dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, routeId: 'dashboard' },
  { id: 'home-inbox', label: 'Inbox', icon: <Inbox size={16} />, routeId: 'inbox' },
  { id: 'home-usage', label: 'Usage', icon: <BarChart3 size={16} />, routeId: 'usage' },
  { id: 'home-marketplace', label: 'Marketplace', icon: <Store size={16} />, routeId: 'marketplace' },
]

// --- Home sidebar sections ---

export function buildHomeSidebarSections(): AssetSection[] {
  return [
    {
      id: 'settings',
      label: 'SETTINGS',
      items: [
        { id: 'setting-preferences', label: 'Preferences', icon: <Settings size={14} />, routeId: 'settings' },
      ],
      collapsible: false,
    },
  ]
}
