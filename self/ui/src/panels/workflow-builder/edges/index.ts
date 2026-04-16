export { ExecutionEdge } from './ExecutionEdge'
export { ConfigEdge } from './ConfigEdge'
export { MemoryFlowEdge } from './MemoryFlowEdge'

/**
 * React Flow `edgeTypes` prop value.
 * Maps edge type keys to custom edge components.
 *
 * Required keys (must match `type` field on edge data):
 *   - 'execution' — solid line for execution flow
 *   - 'config'    — dashed line for configuration dependencies
 *   - 'memory'    — dotted line for memory/context flow
 *
 * MUST be defined at module level (not inside a component) to prevent
 * React Flow from remounting edges on every render.
 */
import { ExecutionEdge as ExecutionEdgeComponent } from './ExecutionEdge'
import { ConfigEdge as ConfigEdgeComponent } from './ConfigEdge'
import { MemoryFlowEdge as MemoryFlowEdgeComponent } from './MemoryFlowEdge'

export const edgeTypes = {
  execution: ExecutionEdgeComponent,
  config: ConfigEdgeComponent,
  memory: MemoryFlowEdgeComponent,
}
