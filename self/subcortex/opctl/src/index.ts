/**
 * @nous/subcortex-opctl — Operator control command integrity service.
 *
 * Phase 2.5: Control command envelope validation, anti-replay, confirmation proof,
 * scope resolution, arbitration, witness integration, fail-closed policy.
 */
export { OpctlService } from './opctl-service.js';
export { InMemoryReplayStore } from './replay-store.js';
export { InMemoryStartLockStore } from './start-lock.js';
export { InMemoryScopeLockStore } from './scope-lock.js';
export type { ReplayStore } from './replay-store.js';
export type { StartLockStore } from './start-lock.js';
export type { ScopeLockStore } from './scope-lock.js';
