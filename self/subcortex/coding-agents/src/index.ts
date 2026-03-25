/**
 * @nous/subcortex-coding-agents — SDK adapters with governance hooks.
 *
 * Exports:
 *   - Types: AgentHooks, CodingAgentTaskInput, CodingAgentTaskResult, MaoAgentEvent
 *   - Adapters: runClaudeAgent, runCodexAgent
 *   - Factory: createGovernanceHooks (+ GovernanceHookDeps)
 */

// Types
export type {
  AgentHooks,
  CodingAgentTaskInput,
  CodingAgentTaskResult,
  MaoAgentEvent,
} from './types.js';

// Adapters
export { runClaudeAgent } from './claude-adapter.js';
export { runCodexAgent } from './codex-adapter.js';

// Governance hook factory
export { createGovernanceHooks } from './governance-hooks.js';
export type { GovernanceHookDeps } from './governance-hooks.js';

// Workflow node handler
export {
  createCodingAgentNodeHandler,
  registerCodingAgentNodeTypes,
  CODING_AGENT_NODE_TYPES,
} from './workflow-node-handler.js';
export type {
  CodingAgentNodeHandlerDeps,
  CodingAgentNodeType,
} from './workflow-node-handler.js';
