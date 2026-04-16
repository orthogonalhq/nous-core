/**
 * Web panel definition registry — mirrors desktop's NATIVE_PANEL_DEFS
 * without Electron-specific panels or params factories.
 */

export type PanelDef = {
  id: string
  component: string
  title: string
  position?: { direction: string; referencePanel: string }
}

export const WEB_PANEL_DEFS: PanelDef[] = [
  { id: 'chat', component: 'chat', title: 'Chat' },
  { id: 'node-projection', component: 'node-projection', title: 'Skill Projection' },
  { id: 'mao', component: 'mao', title: 'MAO' },
  { id: 'codexbar', component: 'codexbar', title: 'AI Usage' },
  { id: 'dashboard', component: 'dashboard', title: 'Dashboard' },
  { id: 'coding-agents', component: 'coding-agents', title: 'Coding Agents' },
  { id: 'preferences', component: 'preferences', title: 'Preferences' },
  { id: 'workflow-builder', component: 'workflow-builder', title: 'Workflow Builder' },
]

/** Position directives for the default layout (desktop DEFAULT_POSITIONS equivalent). */
export const DEFAULT_POSITIONS: Record<string, { direction: string; referencePanel: string }> = {
  'node-projection': { direction: 'right', referencePanel: 'chat' },
  mao: { direction: 'below', referencePanel: 'node-projection' },
  codexbar: { direction: 'within', referencePanel: 'chat' },
  dashboard: { direction: 'within', referencePanel: 'chat' },
  'coding-agents': { direction: 'within', referencePanel: 'mao' },
  preferences: { direction: 'within', referencePanel: 'chat' },
  'workflow-builder': { direction: 'within', referencePanel: 'chat' },
}

/** Dependency-safe addition order — referenced panels before dependents. */
export const PANEL_ADD_ORDER: string[] = [
  'chat',
  'node-projection',
  'mao',
  'codexbar',
  'dashboard',
  'coding-agents',
  'preferences',
  'workflow-builder',
]
