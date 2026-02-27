/**
 * @nous/memory-distillation — Distillation engine for Nous-OSS.
 *
 * Phase 4.3: Clustering, pattern generation, supersession, confidence lifecycle.
 */
export { DistillationEngine } from './distillation-engine.js';
export type { DistillationEngineConfig } from './distillation-engine.js';
export { identifyClusters } from './clustering.js';
export { computeInitialConfidence } from './confidence.js';
export { updateConfidence } from './confidence-lifecycle.js';
export { reverseSupersession } from './supersession-reversal.js';
