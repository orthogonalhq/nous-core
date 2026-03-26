import type { Node, Edge, Viewport, XYPosition } from '@xyflow/react'
import type { WorkflowSpec, WorkflowSpecValidationError } from '@nous/shared'

/**
 * Node categories — mirrors NousNodeCategory from @nous/shared.
 * Kept as a local string literal union to avoid @nous/ui importing
 * runtime Zod schemas from @nous/shared for a compile-time-only concern.
 *
 * 7 categories per workflow-convention-v1 `nous.<category>.<action>` namespace.
 */
export type NodeCategory =
  | 'trigger'
  | 'agent'
  | 'condition'
  | 'app'
  | 'tool'
  | 'memory'
  | 'governance'

/** Data payload carried by each builder node. */
export interface WorkflowBuilderNodeData {
  label: string
  category: NodeCategory
  description?: string
  /** Full nous.<category>.<action> type string from workflow-convention-v1. */
  nousType: string
  [key: string]: unknown
}

/**
 * Builder node — extends React Flow's Node<T> generic.
 * The `type` field is the React Flow component key (e.g., 'builderNode'),
 * not the nous.<category>.<action> string (which lives in data.nousType).
 */
export type WorkflowBuilderNode = Node<WorkflowBuilderNodeData>

/** Edge type discriminator for visual styling. */
export type BuilderEdgeType = 'execution' | 'config'

/** Data payload carried by each builder edge. */
export interface WorkflowBuilderEdgeData {
  edgeType: BuilderEdgeType
  label?: string
  [key: string]: unknown
}

/** Builder edge — extends React Flow's Edge<T> generic. */
export type WorkflowBuilderEdge = Edge<WorkflowBuilderEdgeData>

/** Builder interaction mode per UX design direction. */
export type BuilderMode = 'authoring' | 'monitoring' | 'inspecting'

/** Port direction for node connection points. */
export type PortDirection = 'input' | 'output'

/** Definition of a single connection port on a node type. */
export interface NodePortDefinition {
  id: string
  label: string
  direction: PortDirection
  /** If true, multiple edges can connect to/from this port. */
  multi?: boolean
}

/** Registry entry mapping a node category to its visual/behavioral config. */
export interface NodeRegistryEntry {
  category: NodeCategory
  /** Default display label for new nodes of this category. */
  defaultLabel: string
  /** Default ports for this node category. */
  ports: NodePortDefinition[]
  /** CSS custom property reference for the node category color. */
  colorVar: string
}

// ─── Phase 2 types ─────────────────────────────────────────────────────────

/** State for a single floating panel instance. */
export interface FloatingPanelState {
  /** Current x position relative to the canvas wrapper. */
  x: number
  /** Current y position relative to the canvas wrapper. */
  y: number
  /** Whether the panel body is collapsed (header-only mode). */
  collapsed: boolean
  /** Whether the panel position is locked (drag disabled). */
  pinned: boolean
  /** Whether the panel is visible. */
  visible: boolean
}

/**
 * Position initializer for a floating panel.
 * Preset values resolve to computed positions during mount.
 */
export type FloatingPanelPosition =
  | 'left'
  | 'right'
  | { x: number; y: number }

/**
 * Palette display item — derived from NodeRegistryEntry
 * with rendering-specific fields for the Node Palette UI.
 */
export interface NodePaletteItem {
  /** Full nous.<category>.<action> type key from the registry. */
  nousType: string
  /** Display label for the palette item. */
  label: string
  /** Node category from workflow-convention-v1. */
  category: NodeCategory
  /** CSS custom property reference for the category color. */
  colorVar: string
  /** Codicon icon class name (e.g., 'codicon-zap'). */
  icon: string
}

// ─── Authoring Action Union (SP 2.2) ────────────────────────────────────────

/** Discriminated union of all undoable builder mutations. */
export type AuthoringAction =
  | { type: 'addNode'; node: WorkflowBuilderNode }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'addEdge'; edge: WorkflowBuilderEdge }
  | { type: 'removeEdge'; edgeId: string }
  | { type: 'moveNode'; nodeId: string; from: XYPosition; to: XYPosition }
  | { type: 'updateNodeData'; nodeId: string; before: Partial<WorkflowBuilderNodeData>; after: Partial<WorkflowBuilderNodeData> }

// ─── Command Pattern (SP 2.2) ──────────────────────────────────────────────

/** Subset of builder state that commands can mutate. */
export interface BuilderMutableState {
  nodes: WorkflowBuilderNode[]
  edges: WorkflowBuilderEdge[]
}

/** An undoable command wrapping an AuthoringAction. */
export interface BuilderCommand {
  /** The action this command represents. */
  action: AuthoringAction
  /** Human-readable description for potential UI display. */
  label: string
  /** Apply the mutation to state. */
  execute: (state: BuilderMutableState) => BuilderMutableState
  /** Reverse the mutation. */
  undo: (state: BuilderMutableState) => BuilderMutableState
}

// ─── Undo/Redo State (SP 2.2) ──────────────────────────────────────────────

export interface UndoRedoState {
  /** Command history stack. Index 0 is oldest. */
  history: BuilderCommand[]
  /** Points to the next undo position (index of last executed command + 1). */
  pointer: number
  /** Maximum history depth. Default: 50. */
  maxDepth: number
}

// ─── Workflow Sync State (SP 2.2) ──────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface WorkflowSyncState {
  /** The last successfully loaded/synced spec (null before first load). */
  lastSyncedSpec: WorkflowSpec | null
  /** Validation errors from the most recent outbound sync. Empty array = valid. */
  validationErrors: WorkflowSpecValidationError[]
  /** True when builder state has diverged from lastSyncedSpec. */
  isDirty: boolean
  /** Current sync operation status. */
  syncStatus: SyncStatus
}

// ─── Top-level Builder State ────────────────────────────────────────────────

/** Top-level builder state — consumed by useBuilderState in SP 1.4. */
export interface WorkflowBuilderState {
  nodes: WorkflowBuilderNode[]
  edges: WorkflowBuilderEdge[]
  /** Currently selected node/edge IDs. */
  selectedIds: string[]
  mode: BuilderMode
  viewport: Viewport
}

// ─── Inspector Types (SP 2.3) ──────────────────────────────────────────────

import type { z } from 'zod'

/**
 * Discriminated union describing which inspector panel is active.
 * Structural mutual exclusivity — cannot have two active inspectors.
 */
export type InspectorState =
  | { type: 'node'; nodeId: string }
  | { type: 'edge'; edgeId: string }
  | { type: 'workflow' }
  | { type: 'none' }

/** Props for the generic Zod-schema-to-form renderer. */
export interface ParameterFormProps {
  /** Zod schema for the node type's parameters. */
  schema: z.ZodObject<z.ZodRawShape>
  /** Current parameter values (from node.data). */
  values: Record<string, unknown>
  /** Validation errors keyed by field path. */
  validationErrors?: Record<string, string>
  /** Called when any field value changes. Emits partial update. */
  onChange: (patch: Record<string, unknown>) => void
  /** Whether all fields should render read-only. */
  readOnly?: boolean
}

/** A single binding option for skill/contract/template binding. */
export interface BindingOption {
  /** Machine-readable binding key (skill name, contract name, etc). */
  value: string
  /** Human-readable display label. */
  label: string
  /** Binding type discriminator. */
  kind: 'skill' | 'contract' | 'template'
}

/** Props for the skill/contract/template binding popover. */
export interface BindingPopoverProps {
  /** The parameter field name this popover is bound to. */
  fieldName: string
  /** Current bound value (may be a skill name, contract name, or template name). */
  value: string | undefined
  /** Available binding options. */
  options: BindingOption[]
  /** Called when user selects a binding. */
  onSelect: (value: string) => void
  /** Called when user clears the binding. */
  onClear: () => void
}

// ─── Context Menu Types (SP 2.4) ────────────────────────────────────────────

/** Discriminator for which context menu is active. */
export type ContextMenuType = 'canvas' | 'node' | 'edge'

/** State for the currently-open context menu (null = closed). */
export interface ContextMenuState {
  /** Which menu variant is open. */
  type: ContextMenuType
  /** Screen-space position for rendering the menu. */
  position: { x: number; y: number }
  /** Target element ID (nodeId or edgeId). Null for canvas menu. */
  targetId: string | null
}

/** A single action item within a context menu. */
export interface ContextMenuAction {
  /** Unique key for this action. */
  id: string
  /** Display label. */
  label: string
  /** Codicon icon class name (e.g., 'codicon-trash'). */
  icon: string
  /** Whether this action is disabled (placeholder actions). */
  disabled?: boolean
  /** If true, this action has a sub-menu (e.g., "Add node" categories). */
  hasSubmenu?: boolean
  /** Handler called when the action is selected. */
  handler: () => void
}

// ─── Node Search Types (SP 2.4) ─────────────────────────────────────────────

/** State for the Node Search command palette. */
export interface NodeSearchState {
  /** Whether the search overlay is open. */
  isOpen: boolean
  /** Current search query string. */
  query: string
}

/** A single result item in the Node Search palette. */
export interface NodeSearchResult {
  /** Unique key for this result. */
  id: string
  /** Display label (node label for existing nodes, type label for registry entries). */
  label: string
  /** Codicon icon class name. */
  icon: string
  /** Category for grouping in results. */
  category: NodeCategory
  /** Result type discriminator. */
  type: 'existing-node' | 'add-node'
  /** The nousType string (for add-node) or node ID (for existing-node). */
  value: string
}

// ─── Keyboard Navigation Types (SP 2.5) ─────────────────────────────────────

/** State tracked by useKeyboardNav. */
export interface KeyboardNavState {
  /** Index into the position-sorted node array. -1 = no focus. */
  focusedIndex: number
  /** Whether keyboard nav is actively intercepting keys (canvas has focus). */
  isActive: boolean
}

/** A renderable validation error item for the ValidationPanel. */
export interface ValidationPanelItem {
  /** Original error path from WorkflowSpecValidationError. */
  path: string
  /** Human-readable error message. */
  message: string
  /** Severity level derived from error path analysis. */
  severity: 'error' | 'warning'
  /** Affected element ID extracted from the error path. Null if structural. */
  elementId: string | null
  /** Element type for icon rendering. */
  elementType: 'node' | 'edge' | 'spec' | null
}
