export { PackageLifecycleOrchestrator } from './orchestrator.js';
export { PackageUpdateController } from './update-controller.js';
export {
  InMemoryPackageLifecycleEvidenceEmitter,
  type PackageLifecycleEvidenceEmitter,
} from './evidence-emitter.js';
export {
  InMemoryPackageLifecycleStateStore,
  LifecycleStateConflictError,
} from './state-store.js';
export {
  isTransitionAllowed,
  resolveTransitionTargetState,
  ALLOWED_TRANSITIONS_BY_STATE,
} from './transition-matrix.js';
