import type { NodeRegistryEntry, NodeCategory } from '../../../types/workflow-builder'

// ─── Internal extended registry entry ────────────────────────────────────────

/**
 * Extends the shared NodeRegistryEntry with rendering-specific fields.
 * Phase 2 may promote these to the shared type when the node palette needs them.
 */
export interface NodeRegistryEntryInternal extends NodeRegistryEntry {
  /** Default node width in pixels. */
  width: number
  /** Default node height in pixels. */
  height: number
  /** Codicon icon class name (e.g., 'codicon-zap'). */
  icon: string
}

// ─── Registry entries ────────────────────────────────────────────────────────

const NODE_REGISTRY = new Map<string, NodeRegistryEntryInternal>([
  // ─── Trigger (2) — output only, entry points ────────────────────────────────
  [
    'nous.trigger.schedule',
    {
      category: 'trigger',
      defaultLabel: 'Schedule Trigger',
      ports: [
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-trigger)',
      width: 200,
      height: 80,
      icon: 'codicon-clock',
    },
  ],
  [
    'nous.trigger.webhook',
    {
      category: 'trigger',
      defaultLabel: 'Webhook Trigger',
      ports: [
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-trigger)',
      width: 200,
      height: 80,
      icon: 'codicon-zap',
    },
  ],

  // ─── Agent (2) — standard flow ──────────────────────────────────────────────
  [
    'nous.agent.claude',
    {
      category: 'agent',
      defaultLabel: 'Claude Agent',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-agent)',
      width: 200,
      height: 80,
      icon: 'codicon-hubot',
    },
  ],
  [
    'nous.agent.codex',
    {
      category: 'agent',
      defaultLabel: 'Codex Agent',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-agent)',
      width: 200,
      height: 80,
      icon: 'codicon-hubot',
    },
  ],

  // ─── Condition (7) — branching, join, dual-output ───────────────────────────
  [
    'nous.condition.if',
    {
      category: 'condition',
      defaultLabel: 'If Condition',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output', multi: true },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-git-compare',
    },
  ],
  [
    'nous.condition.switch',
    {
      category: 'condition',
      defaultLabel: 'Switch',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output', multi: true },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-list-tree',
    },
  ],
  [
    'nous.condition.governance-gate',
    {
      category: 'condition',
      defaultLabel: 'Governance Gate',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output', multi: true },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-shield',
    },
  ],
  [
    'nous.condition.parallel-split',
    {
      category: 'condition',
      defaultLabel: 'Parallel Split',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output', multi: true },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-split-horizontal',
    },
  ],
  [
    'nous.condition.parallel-join',
    {
      category: 'condition',
      defaultLabel: 'Parallel Join',
      ports: [
        { id: 'target', label: 'Input', direction: 'input', multi: true },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-merge',
    },
  ],
  [
    'nous.condition.loop',
    {
      category: 'condition',
      defaultLabel: 'Loop',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'loop', label: 'Loop', direction: 'output' },
        { id: 'exit', label: 'Exit', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-sync',
    },
  ],
  [
    'nous.condition.error-handler',
    {
      category: 'condition',
      defaultLabel: 'Error Handler',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'success', label: 'Success', direction: 'output' },
        { id: 'error', label: 'Error', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-condition)',
      width: 200,
      height: 80,
      icon: 'codicon-warning',
    },
  ],

  // ─── App (2) — standard flow ────────────────────────────────────────────────
  [
    'nous.app.http-request',
    {
      category: 'app',
      defaultLabel: 'HTTP Request',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-app)',
      width: 200,
      height: 80,
      icon: 'codicon-globe',
    },
  ],
  [
    'nous.app.slack',
    {
      category: 'app',
      defaultLabel: 'Slack',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-app)',
      width: 200,
      height: 80,
      icon: 'codicon-comment-discussion',
    },
  ],

  // ─── Tool (2) — standard flow ───────────────────────────────────────────────
  [
    'nous.tool.memory-search',
    {
      category: 'tool',
      defaultLabel: 'Memory Search',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-tool)',
      width: 200,
      height: 80,
      icon: 'codicon-search',
    },
  ],
  [
    'nous.tool.artifact-store',
    {
      category: 'tool',
      defaultLabel: 'Artifact Store',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-tool)',
      width: 200,
      height: 80,
      icon: 'codicon-archive',
    },
  ],

  // ─── Memory (3) — standard flow ─────────────────────────────────────────────
  [
    'nous.memory.read',
    {
      category: 'memory',
      defaultLabel: 'Memory Read',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-memory)',
      width: 200,
      height: 80,
      icon: 'codicon-book',
    },
  ],
  [
    'nous.memory.write',
    {
      category: 'memory',
      defaultLabel: 'Memory Write',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-memory)',
      width: 200,
      height: 80,
      icon: 'codicon-edit',
    },
  ],
  [
    'nous.memory.search',
    {
      category: 'memory',
      defaultLabel: 'Memory Search',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-memory)',
      width: 200,
      height: 80,
      icon: 'codicon-search',
    },
  ],

  // ─── Governance (3) — standard flow + multi-output ──────────────────────────
  [
    'nous.governance.pfc-gate',
    {
      category: 'governance',
      defaultLabel: 'PFC Gate',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output', multi: true },
      ],
      colorVar: 'var(--nous-builder-node-governance)',
      width: 200,
      height: 80,
      icon: 'codicon-verified',
    },
  ],
  [
    'nous.governance.witness-checkpoint',
    {
      category: 'governance',
      defaultLabel: 'Witness Checkpoint',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-governance)',
      width: 200,
      height: 80,
      icon: 'codicon-eye',
    },
  ],
  [
    'nous.governance.escalation',
    {
      category: 'governance',
      defaultLabel: 'Escalation',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-governance)',
      width: 200,
      height: 80,
      icon: 'codicon-bell',
    },
  ],
])

// ─── Fallback entry for unknown node types ───────────────────────────────────

const FALLBACK_ENTRY: NodeRegistryEntryInternal = {
  category: 'tool' as NodeCategory,
  defaultLabel: 'Unknown',
  ports: [
    { id: 'target', label: 'Input', direction: 'input' },
    { id: 'source', label: 'Output', direction: 'output' },
  ],
  colorVar: 'var(--nous-fg-dim)',
  width: 200,
  height: 80,
  icon: 'codicon-symbol-misc',
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Resolves a `nous.<category>.<action>` type string to its registry entry.
 * Falls back to a generic entry for unknown types.
 */
/**
 * Returns all registry entries as [nousType, entry] tuples.
 * Read-only accessor — does not modify the registry.
 */
export function getAllRegistryEntries(): [string, NodeRegistryEntryInternal][] {
  return Array.from(NODE_REGISTRY.entries())
}

export function getRegistryEntry(nousType: string): NodeRegistryEntryInternal {
  // Direct lookup first
  const direct = NODE_REGISTRY.get(nousType)
  if (direct) return direct

  // Try category-level fallback: find any entry matching the category segment
  const category = nousType?.split('.')[1]
  if (category) {
    for (const entry of NODE_REGISTRY.values()) {
      if (entry.category === category) return entry
    }
  }

  return FALLBACK_ENTRY
}