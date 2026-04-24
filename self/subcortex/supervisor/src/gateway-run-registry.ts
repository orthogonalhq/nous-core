/**
 * WR-162 SP 4 — GatewayRunSnapshotRegistry shape.
 *
 * SDS § Data Model § `GatewayRunSnapshotRegistry` shape. Read-only accessor
 * keyed by `runId` → `GatewayRunSnapshot | null` (null when the runtime
 * has not registered the run, or the run has ended).
 *
 * Bootstrap wires a concrete implementation over `CortexRuntime`'s per-run
 * snapshot state. The supervisor package does NOT import `CortexRuntime`
 * directly (dependency-layer rule) — only this interface.
 *
 * SP 4 uses the `.get(runId)` surface only. SP 6 may extend with
 * `listAll()` to support a periodic fan-out observation source for
 * ledger-level infrastructure checks (currently deferred per SDS §
 * Deferred to SP 6 item 4 / SUPV-SP4-003 revised).
 */
import type { GatewayRunId, GatewayRunSnapshot } from '@nous/shared';

export interface GatewayRunSnapshotRegistry {
  readonly get: (runId: GatewayRunId) => GatewayRunSnapshot | null;
}
