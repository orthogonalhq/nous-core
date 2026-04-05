import {
  LayoutDashboard,
  Inbox,
  BarChart3,
  Store,
  Settings,
  Info,
  Key,
  Cpu,
  Users,
  Activity,
  Wand2,
  HardDrive,
} from 'lucide-react'
import type { SidebarTopNavItem, AssetSection } from './types'

// --- Home sidebar top nav items ---

export const HOME_TOP_NAV: SidebarTopNavItem[] = [
  { id: 'home-dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, routeId: 'dashboard' },
  { id: 'home-inbox', label: 'Inbox', icon: <Inbox size={16} />, routeId: 'inbox' },
  { id: 'home-usage', label: 'Usage', icon: <BarChart3 size={16} />, routeId: 'usage' },
  { id: 'home-marketplace', label: 'Marketplace', icon: <Store size={16} />, routeId: 'marketplace' },
]

// --- Home sidebar sections (settings categories) ---

export function buildHomeSidebarSections(): AssetSection[] {
  return [
    {
      id: 'general',
      label: 'GENERAL',
      items: [
        { id: 'setting-shell-mode', label: 'Shell Mode', icon: <Settings size={14} />, routeId: 'settings' },
        { id: 'setting-about', label: 'About', icon: <Info size={14} />, routeId: 'settings' },
      ],
      collapsible: true,
    },
    {
      id: 'ai-configuration',
      label: 'AI CONFIGURATION',
      items: [
        { id: 'setting-api-keys', label: 'API Keys', icon: <Key size={14} />, routeId: 'settings' },
        { id: 'setting-model-config', label: 'Model Config', icon: <Cpu size={14} />, routeId: 'settings' },
        { id: 'setting-role-assignments', label: 'Role Assignments', icon: <Users size={14} />, routeId: 'settings' },
      ],
      collapsible: true,
    },
    {
      id: 'system',
      label: 'SYSTEM',
      items: [
        { id: 'setting-system-status', label: 'System Status', icon: <Activity size={14} />, routeId: 'settings' },
        { id: 'setting-setup-wizard', label: 'Setup Wizard', icon: <Wand2 size={14} />, routeId: 'settings' },
        { id: 'setting-local-models', label: 'Local Models', icon: <HardDrive size={14} />, routeId: 'settings' },
      ],
      collapsible: true,
    },
  ]
}
