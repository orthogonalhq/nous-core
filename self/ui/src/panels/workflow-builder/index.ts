export { WorkflowBuilderPanel } from './WorkflowBuilderPanel'
export type { WorkflowBuilderPanelCoreProps } from './WorkflowBuilderPanel'
export { BuilderToolbar } from './BuilderToolbar'
export type { BuilderToolbarProps } from './BuilderToolbar'
export { useBuilderState } from './hooks/useBuilderState'
export type { UseBuilderStateReturn } from './hooks/useBuilderState'
export { useWorkflowSync } from './hooks/useWorkflowSync'
export type { UseWorkflowSyncReturn } from './hooks/useWorkflowSync'
export { useUndoRedo } from './hooks/useUndoRedo'
export type { UseUndoRedoReturn } from './hooks/useUndoRedo'
export { FloatingPanel, useFloatingPanel } from './floating-panel'
export type { FloatingPanelProps, UseFloatingPanelReturn, UseFloatingPanelOptions } from './floating-panel'
export { NodePalette } from './NodePalette'
export type { NodePaletteProps } from './NodePalette'

// Type re-exports for Phase 2
export type {
  FloatingPanelState,
  FloatingPanelPosition,
  NodePaletteItem,
  AuthoringAction,
  BuilderCommand,
  BuilderMutableState,
  UndoRedoState,
  WorkflowSyncState,
  SyncStatus,
} from '../../types/workflow-builder'
