// ---------------------------------------------------------------------------
// openui-adapter — Public API
// ---------------------------------------------------------------------------
// This is the sole entry point for consuming the OpenUI adapter. All boundary
// types are Nous-owned. Zero @openuidev/* imports in this file.
// ---------------------------------------------------------------------------

// Boundary types
export type {
  NousCardDefinition,
  NousCardElement,
  NousCardTree,
  NousParseResult,
  CardAction,
  CardActionHandlers,
  NousCardRegistry,
  CardRendererProps,
  RenderCardContext,
} from './types'

// Facade functions
export { registerNousCard, getCardRegistry } from './registry'
export { parseCardContent } from './parser'
export { renderCardTree, renderStructuredCard } from './renderer'
