import {
  LayoutDashboard,
  Inbox,
  BarChart3,
  Store,
  Settings,
  Activity,
  ClipboardList,
  MessageSquare,
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

export const VISUAL_HOME_TOP_NAV: SidebarTopNavItem[] = [
  { id: 'visual-inbox', label: 'Inbox', icon: <Inbox size={16} />, routeId: 'inbox' },
  { id: 'visual-pulse', label: 'Pulse', icon: <Activity size={16} />, routeId: 'dashboard' },
]

export function buildVisualHomeSidebarSections(): AssetSection[] {
  return [
    {
      id: 'visual-workflows',
      label: 'Workflows',
      items: [
        { id: 'client-onboarding', label: 'Client onboarding', icon: <ClipboardList size={14} />, routeId: 'home' },
        { id: 'intake-review', label: 'Intake review', indicatorColor: 'var(--nous-workspace-warning)', routeId: 'workflow-detail::intake-review' },
        { id: 'handoff-plan', label: 'Handoff plan', indicatorColor: 'var(--nous-workspace-info)', routeId: 'workflow-detail::handoff-plan' },
      ],
      collapsible: true,
    },
    {
      id: 'visual-tasks',
      label: 'Tasks',
      items: [
        { id: 'review-client-intakes', label: 'Review client intakes', indicatorColor: 'var(--nous-workspace-warning)', routeId: 'task-detail::review-client-intakes' },
        { id: 'approve-email-drafts', label: 'Approve email drafts', indicatorColor: 'var(--nous-workspace-info)', routeId: 'task-detail::approve-email-drafts' },
        { id: 'follow-ups-paused', label: 'Follow-ups paused', indicatorColor: 'var(--nous-workspace-success)', routeId: 'task-detail::follow-ups-paused' },
      ],
      collapsible: true,
    },
    {
      id: 'visual-chats',
      label: 'Chats',
      items: [
        { id: 'nue', label: 'Nue', icon: <MessageSquare size={14} />, routeId: 'chat' },
        { id: 'andrew', label: 'Andrew', icon: <MessageSquare size={14} />, routeId: 'chat-andrew' },
      ],
      collapsible: true,
    },
  ]
}
