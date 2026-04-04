import type { SidebarTopNavItem, AssetSection } from '@nous/ui/components'
import {
  STUB_WORKFLOWS,
  STUB_TASKS,
  STUB_TEAMS,
  STUB_AGENTS,
} from '@nous/ui'

// --- Top nav items (static) ---

export const DESKTOP_TOP_NAV: SidebarTopNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'D', routeId: 'dashboard' },
  { id: 'org-chart', label: 'Org Chart', icon: 'O', routeId: 'org-chart' },
  { id: 'inbox', label: 'Inbox', icon: 'I', routeId: 'inbox' },
]

// --- Sidebar sections ---

/**
 * Build sidebar sections for the desktop app.
 * WORKFLOWS uses stub data for now (tRPC wiring deferred to WR-108).
 * TASKS is live when a tasksSection is provided; falls back to disabled stub.
 * TEAMS, AGENTS are disabled stubs.
 */
export function buildDesktopSidebarSections(params?: {
  tasksSection?: AssetSection
}): AssetSection[] {
  return [
    {
      id: 'workflows',
      label: 'WORKFLOWS',
      items: STUB_WORKFLOWS.map((wf) => ({
        id: wf.id,
        label: wf.title,
        routeId: 'workflow-detail',
        indicatorColor: undefined,
      })),
      collapsible: true,
      disabled: false,
    },
    params?.tasksSection ?? {
      id: 'tasks',
      label: 'TASKS',
      items: STUB_TASKS,
      collapsible: true,
      disabled: true,
    },
    {
      id: 'teams',
      label: 'TEAMS',
      items: STUB_TEAMS,
      collapsible: true,
      disabled: true,
    },
    {
      id: 'agents',
      label: 'AGENTS',
      items: STUB_AGENTS,
      collapsible: true,
      disabled: true,
    },
  ]
}
