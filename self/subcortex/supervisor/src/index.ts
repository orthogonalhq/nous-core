/**
 * @nous/subcortex-supervisor — supervisor service skeleton, detector
 * classifier, witness emission helpers, composite-outbox sink, and factory
 * entry points (WR-162 SP 3 + SP 4).
 *
 * The private `RingBuffer` helper is deliberately NOT exported — callers
 * should interact with the service surface (`recordObservation`, read
 * procedures, `runClassifier`) only.
 *
 * Detectors, the classifier function, and detector-context types are
 * package-internal too (they are reachable through `SupervisorService`).
 * Re-exporting them would break the SUPV-SP4-001 gate-bypass property
 * (see SDS § Failure Modes — "SUPV-SP4-001 gate accidentally bypassed").
 */
export {
  SupervisorService,
  createSupervisorService,
  type SupervisorServiceDeps,
  type SupervisorEnforcementSlot,
} from './supervisor-service.js';
export {
  enforce,
  EnforcementContractDefectError,
  type EnforcementDeps,
  type EnforcementResult,
  type EnforcementOpctlService,
  type ProofIssuer,
} from './enforcement.js';
export {
  SupervisorOutboxSink,
  type SupervisorOutboxSinkDeps,
} from './supervisor-outbox-sink.js';
export {
  emitDetectionWitness,
  emitEnforcementWitness,
  type EmitDetectionWitnessArgs,
  type EmitEnforcementWitnessArgs,
} from './witness-emission.js';
export {
  toWitnessdEnforcement,
  fromWitnessdEnforcement,
  type SupervisorEnforcementActionSP4,
} from './enforcement-action-translator.js';
export {
  defaultAgentClassToolSurfaceRegistry,
  type AgentClassToolSurfaceRegistry,
} from './agent-class-tool-surface.js';
export type { GatewayRunSnapshotRegistry } from './gateway-run-registry.js';
export type {
  BudgetReadonlyView,
  ToolSurfaceReadonlyView,
  WitnessReadonlyView,
} from './detection/types.js';
// WR-162 SP 6 — sentinel classifier module.
export {
  createSentinelModule,
  createSentinelWitnessEmitter,
  SentinelContractDefectError,
  type SentinelDeps,
  type SentinelModule,
  type SentinelThresholds,
  type SentinelObservationIngress,
  type SentinelClassificationResult,
  type SupervisorAnomalyRecord,
  type SentinelWitnessArgs,
  type SentinelCompositeEntry,
} from './sentinel.js';
// WR-162 SP 6 — ring-buffer exposed for bootstrap sentinel-anomaly-buffer
// construction. Supervisor internals remain the canonical backing store.
export { RingBuffer as SupervisorRingBuffer } from './ring-buffer.js';
