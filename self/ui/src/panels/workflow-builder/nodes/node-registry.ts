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
  [
    'nous.agent.classify',
    {
      category: 'agent',
      defaultLabel: 'Agent Classify',
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
    'nous.condition.branch',
    {
      category: 'condition',
      defaultLabel: 'Condition Branch',
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
    'nous.app.slack-notify',
    {
      category: 'app',
      defaultLabel: 'Slack Notify',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-app)',
      width: 200,
      height: 80,
      icon: 'codicon-plug',
    },
  ],
  [
    'nous.tool.vector-search',
    {
      category: 'tool',
      defaultLabel: 'Vector Search',
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
      icon: 'codicon-database',
    },
  ],
  [
    'nous.governance.audit-log',
    {
      category: 'governance',
      defaultLabel: 'Audit Log',
      ports: [
        { id: 'target', label: 'Input', direction: 'input' },
        { id: 'source', label: 'Output', direction: 'output' },
      ],
      colorVar: 'var(--nous-builder-node-governance)',
      width: 200,
      height: 80,
      icon: 'codicon-shield',
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