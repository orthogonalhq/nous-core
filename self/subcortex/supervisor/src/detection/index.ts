/**
 * Detector barrel. Exports the 8 SP 4 deterministic detectors and the
 * frozen `DETECTORS` array consumed by the classifier loop in
 * `../classifier.ts`. Order matches the taxonomy row sequence (SUP-001
 * before SUP-002 before ... before SUP-008); classifier returns records
 * in the same order (§ Classifier UT-C3 asserts SUP-001 before SUP-003
 * when both fire on one observation).
 */
import type { DetectorFn } from './types.js';
import { detectSup001Workers } from './sup-001-worker-dispatch.js';
import { detectSup002WorkerPrincipalRouting } from './sup-002-worker-principal-routing.js';
import { detectSup003ScopeBoundary } from './sup-003-scope-boundary.js';
import { detectSup004MissingAuthEvidence } from './sup-004-missing-auth-evidence.js';
import { detectSup005BudgetExhausted } from './sup-005-budget-exhausted.js';
import { detectSup006SpawnCeiling } from './sup-006-spawn-ceiling.js';
import { detectSup007WitnessChainBreak } from './sup-007-witness-chain-break.js';
import { detectSup008MissingLifecycle } from './sup-008-missing-lifecycle.js';

export {
  detectSup001Workers,
  detectSup002WorkerPrincipalRouting,
  detectSup003ScopeBoundary,
  detectSup004MissingAuthEvidence,
  detectSup005BudgetExhausted,
  detectSup006SpawnCeiling,
  detectSup007WitnessChainBreak,
  detectSup008MissingLifecycle,
};

export type {
  BudgetReadonlyView,
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
  ToolSurfaceReadonlyView,
  WitnessReadonlyView,
} from './types.js';

/**
 * Ordered immutable detector array. Classifier iterates this in order;
 * order is part of the SDS contract (UT-C3 classifier test asserts
 * SUP-001 precedes SUP-003 in the returned record array).
 */
export const DETECTORS: readonly DetectorFn[] = Object.freeze([
  detectSup001Workers,
  detectSup002WorkerPrincipalRouting,
  detectSup003ScopeBoundary,
  detectSup004MissingAuthEvidence,
  detectSup005BudgetExhausted,
  detectSup006SpawnCeiling,
  detectSup007WitnessChainBreak,
  detectSup008MissingLifecycle,
]);
