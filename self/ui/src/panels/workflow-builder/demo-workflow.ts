import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
} from '../../types/workflow-builder'

/**
 * Demo workflow — Automated Support Triage
 *
 * A realistic workflow scenario used for canvas rendering before any live
 * WorkflowSpec integration exists. Consumed by WorkflowBuilderPanel (SP 1.2)
 * as fallback data when no spec is connected.
 *
 * Layout: top-down flow, ~200px vertical spacing between rows.
 */

export const DEMO_WORKFLOW_NODES: WorkflowBuilderNode[] = [
  {
    id: 'node-1',
    type: 'builderNode',
    position: { x: 300, y: 0 },
    data: {
      label: 'New Ticket Received',
      category: 'trigger',
      nousType: 'nous.trigger.webhook',
      description: 'Fires when a support ticket is created via API webhook',
    },
  },
  {
    id: 'node-2',
    type: 'builderNode',
    position: { x: 300, y: 200 },
    data: {
      label: 'Classify Intent',
      category: 'agent',
      nousType: 'nous.agent.classify',
      description: 'Classifies the ticket intent and urgency using LLM analysis',
    },
  },
  {
    id: 'node-3',
    type: 'builderNode',
    position: { x: 300, y: 400 },
    data: {
      label: 'Is Urgent?',
      category: 'condition',
      nousType: 'nous.condition.branch',
      description: 'Routes based on urgency classification result',
    },
  },
  {
    id: 'node-4',
    type: 'builderNode',
    position: { x: 100, y: 600 },
    data: {
      label: 'Notify Slack Channel',
      category: 'app',
      nousType: 'nous.app.slack-notify',
      description: 'Posts urgent ticket alert to the #support-escalation channel',
    },
  },
  {
    id: 'node-5',
    type: 'builderNode',
    position: { x: 500, y: 600 },
    data: {
      label: 'Search Knowledge Base',
      category: 'tool',
      nousType: 'nous.tool.vector-search',
      description: 'Searches documentation for relevant articles',
    },
  },
  {
    id: 'node-6',
    type: 'builderNode',
    position: { x: 500, y: 800 },
    data: {
      label: 'Store Resolution',
      category: 'memory',
      nousType: 'nous.memory.write',
      description: 'Persists the resolution for future ticket matching',
    },
  },
  {
    id: 'node-7',
    type: 'builderNode',
    position: { x: 100, y: 800 },
    data: {
      label: 'Audit Log Entry',
      category: 'governance',
      nousType: 'nous.governance.audit-log',
      description: 'Records escalation event in the compliance audit trail',
    },
  },
]

export const DEMO_WORKFLOW_EDGES: WorkflowBuilderEdge[] = [
  {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    type: 'default',
    data: { edgeType: 'execution' },
  },
  {
    id: 'edge-2',
    source: 'node-2',
    target: 'node-3',
    type: 'default',
    data: { edgeType: 'execution' },
  },
  {
    id: 'edge-3',
    source: 'node-3',
    target: 'node-4',
    type: 'default',
    label: 'Yes — urgent',
    data: { edgeType: 'execution', label: 'Yes — urgent' },
  },
  {
    id: 'edge-4',
    source: 'node-3',
    target: 'node-5',
    type: 'default',
    label: 'No — standard',
    data: { edgeType: 'execution', label: 'No — standard' },
  },
  {
    id: 'edge-5',
    source: 'node-5',
    target: 'node-6',
    type: 'default',
    data: { edgeType: 'execution' },
  },
  {
    id: 'edge-6',
    source: 'node-4',
    target: 'node-7',
    type: 'default',
    data: { edgeType: 'execution' },
  },
  {
    id: 'edge-7',
    source: 'node-2',
    target: 'node-5',
    type: 'default',
    data: { edgeType: 'config', label: 'Classification context' },
  },
]
