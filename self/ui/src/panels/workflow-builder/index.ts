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

// Inspector components and types (SP 2.3)
export { NodeInspector, EdgeInspector, WorkflowInspector, ParameterForm, BindingPopover } from './inspectors'
export type { NodeInspectorProps, EdgeInspectorProps, WorkflowInspectorProps } from './inspectors'

// Context menu components (SP 2.4)
export { CanvasContextMenu, NodeContextMenu, EdgeContextMenu } from './context-menu'
export type { CanvasContextMenuProps, NodeContextMenuProps, EdgeContextMenuProps } from './context-menu'

// Node Search (SP 2.4)
export { NodeSearch } from './NodeSearch'
export type { NodeSearchProps } from './NodeSearch'

// Validation Panel (SP 2.5)
export { ValidationPanel } from './ValidationPanel'
export type { ValidationPanelProps } from './ValidationPanel'

// Keyboard Navigation hook (SP 2.5)
export { useKeyboardNav } from './hooks/useKeyboardNav'
export type { UseKeyboardNavReturn } from './hooks/useKeyboardNav'

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
  InspectorState,
  ParameterFormProps,
  BindingOption,
  BindingPopoverProps,
  ContextMenuType,
  ContextMenuState,
  ContextMenuAction,
  NodeSearchState,
  NodeSearchResult,
  KeyboardNavState,
  ValidationPanelItem,
} from '../../types/workflow-builder'
