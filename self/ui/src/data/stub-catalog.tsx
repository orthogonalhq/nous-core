import type { AssetSectionItem, CatalogItem } from '../components/shell/types'

/** @todo stub data placeholding for proper build out */
export const STUB_THREADS: CatalogItem[] = [
  { id: 'thread-1', title: 'Project Planning', description: 'Roadmap and milestone discussion', icon: 'T' },
  { id: 'thread-2', title: 'Architecture Review', description: 'System design feedback', icon: 'T' },
  { id: 'thread-3', title: 'Bug Triage', description: 'Issue prioritization session', icon: 'T' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_WORKFLOWS: CatalogItem[] = [
  { id: 'wf-1', title: 'Code Review Pipeline', description: 'Automated review and gate checks', icon: 'W' },
  { id: 'wf-2', title: 'Deploy to Staging', description: 'Build, test, and deploy workflow', icon: 'W' },
  { id: 'wf-3', title: 'Daily Standup', description: 'Agent-assisted status aggregation', icon: 'W' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_SKILLS: CatalogItem[] = [
  { id: 'skill-1', title: 'Code Generation', description: 'Generate code from natural language', icon: 'S' },
  { id: 'skill-2', title: 'Document Analysis', description: 'Extract insights from documents', icon: 'S' },
  { id: 'skill-3', title: 'Test Writing', description: 'Generate test suites from specifications', icon: 'S' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_APPS: CatalogItem[] = [
  { id: 'app-1', title: 'Terminal', description: 'Integrated terminal emulator', icon: 'A' },
  { id: 'app-2', title: 'File Manager', description: 'Browse and manage project files', icon: 'A' },
  { id: 'app-3', title: 'Metrics Dashboard', description: 'System and agent performance metrics', icon: 'A' },
]

// --- Simple shell sidebar stub data ---

/** @todo stub data placeholding for proper build out */
export const STUB_CAMPAIGNS: AssetSectionItem[] = [
  { id: 'campaign-1', label: 'Marketing Campaigns', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }} />, routeId: 'campaigns' },
  { id: 'campaign-2', label: 'Product Management', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#66BB6A', display: 'inline-block' }} />, routeId: 'campaigns' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_TASKS: AssetSectionItem[] = [
  { id: 'task-1', label: 'Manage Emails', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E91E63', display: 'inline-block' }} />, routeId: 'tasks' },
  { id: 'task-2', label: 'Manage Social Media', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F06292', display: 'inline-block' }} />, routeId: 'tasks' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_TEAMS: AssetSectionItem[] = [
  { id: 'team-1', label: 'Marketing', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C4DFF', display: 'inline-block' }} />, routeId: 'teams' },
  { id: 'team-2', label: 'Customer Service', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#536DFE', display: 'inline-block' }} />, routeId: 'teams' },
  { id: 'team-3', label: 'Product', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#69F0AE', display: 'inline-block' }} />, routeId: 'teams' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_AGENTS: AssetSectionItem[] = [
  { id: 'agent-1', label: 'AI Agent', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#009688', display: 'inline-block' }} />, routeId: 'agents' },
  { id: 'agent-2', label: 'Project Agent', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#26A69A', display: 'inline-block' }} />, routeId: 'agents' },
  { id: 'agent-3', label: 'Communications Agent', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4DB6AC', display: 'inline-block' }} />, routeId: 'agents' },
]
