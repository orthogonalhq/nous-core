/**
 * @nous/subcortex-opctl — Operator control command integrity service.
 *
 * Phase 2.5: Control command envelope validation, anti-replay, confirmation proof,
 * scope resolution, arbitration, witness integration, fail-closed policy.
 *
 * WR-162 SP 2: Adds `ConfirmationTierDisplay` type, `T3_COOLDOWN_MS` constant,
 * and `getTierDisplay` stub for the recovery-state UI (SP 7 / SP 14 consumers).
 */
export {
  InMemoryProjectControlStateStore,
} from './project-control-state.js';
export { InMemoryReplayStore } from './replay-store.js';
export { InMemoryScopeLockStore } from './scope-lock.js';
export { InMemoryStartLockStore } from './start-lock.js';
export { OpctlService } from './opctl-service.js';

export { T3_COOLDOWN_MS, getTierDisplay } from './confirmation.js';

export type { ConfirmationTierDisplay } from './confirmation.js';
export type { ProjectControlStateStore } from './project-control-state.js';
export type { ReplayStore } from './replay-store.js';
export type { ScopeLockStore } from './scope-lock.js';
export type { StartLockStore } from './start-lock.js';
