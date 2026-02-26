/**
 * @nous/memory-access — Cross-project memory policy decision engine.
 */
export { MemoryAccessPolicyEngine } from './policy-engine.js';
export {
  isCrossProjectMemoryWrite,
  buildPolicyAccessContextForMemoryWrite,
  type BuildPolicyContextForMemoryWriteParams,
} from './policy-helpers.js';
export {
  PolicyEnforcedRetrievalEngine,
  type PolicyEnforcedRetrievalEngineDeps,
} from './policy-enforced-retrieval.js';
export type { PolicyAccessContext, PolicyEvaluationResult } from '@nous/shared';
