import * as React from 'react'
import { Users, Bot, } from 'lucide-react'
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
  { id: 'wf-stub-1', label: 'Marketing Campaigns', indicatorColor: '#4CAF50', routeId: 'workflow-detail::wf-stub-1' },
  { id: 'wf-stub-2', label: 'Product Management', indicatorColor: '#66BB6A', routeId: 'workflow-detail::wf-stub-2' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_TASKS: AssetSectionItem[] = [
  { id: 'task-1', label: 'Manage Emails', indicatorColor: '#E91E63', routeId: 'task-1' },
  { id: 'task-2', label: 'Manage Social Media', indicatorColor: '#F06292', routeId: 'task-2' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_TEAMS: AssetSectionItem[] = [
  { id: 'team-1', label: 'Marketing', icon: <Users />, routeId: 'team-1' },
  { id: 'team-2', label: 'Customer Service', icon: <Users />, routeId: 'team-2' },
  { id: 'team-3', label: 'Product', icon: <Users />,  routeId: 'team-3' },
]

/** @todo stub data placeholding for proper build out */
export const STUB_AGENTS: AssetSectionItem[] = [
  { id: 'agent-1', label: 'AI Agent', icon: <Bot />, routeId: 'agent-1' },
  { id: 'agent-2', label: 'Project Agent', icon: <Bot />, routeId: 'agent-2' },
  { id: 'agent-3', label: 'Communications Agent', icon: <Bot />, routeId: 'agent-3' },
]
