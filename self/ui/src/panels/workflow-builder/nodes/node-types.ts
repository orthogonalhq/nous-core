import { BaseNode } from './BaseNode'

/**
 * React Flow `nodeTypes` prop value.
 * Maps the `'builderNode'` type key to the BaseNode component.
 * MUST be defined at module level (not inside a component) to prevent
 * React Flow from remounting nodes on every render.
 *
 * Extracted from node-registry.ts to break circular dependency:
 * node-registry.ts ↔ BaseNode.tsx
 */
export const nodeTypes = { builderNode: BaseNode }
