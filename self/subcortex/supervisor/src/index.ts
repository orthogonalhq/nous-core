/**
 * @nous/subcortex-supervisor — Phase-B supervisor service skeleton,
 * composite-outbox sink, and factory entry points for WR-162 SP 3.
 *
 * The private `RingBuffer` helper is deliberately NOT exported — callers
 * should interact with the service surface (`recordObservation`, read
 * procedures) only.
 */
export {
  SupervisorService,
  createSupervisorService,
  type SupervisorServiceDeps,
} from './supervisor-service.js';
export { SupervisorOutboxSink } from './supervisor-outbox-sink.js';
