/**
 * Workmode enforcement module.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
export { InMemoryWorkmodeRegistry } from './workmode-registry.js';
export { InMemoryLeaseStore } from './lease-store.js';
export { WorkmodeAdmissionGuard } from './admission-guard.js';
export {
  CANONICAL_SYSTEM_WORKMODES,
  SYSTEM_IMPLEMENTATION,
  SYSTEM_ARCHITECTURE,
  SYSTEM_SKILL_AUTHORING,
} from './system-workmodes.js';
export { evaluateLifecycleAdmission } from './lifecycle-admission.js';
