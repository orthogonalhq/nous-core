/**
 * Bounded drop-oldest ring buffer — private helper for @nous/subcortex-supervisor.
 *
 * WR-162 SP 3 — backing store for SupervisorService violation / anomaly
 * buffers per `.worklog/sprints/feat/system-observability-and-control/phase-1/phase-1.3/sds.mdx` § Data Model.
 *
 * Semantics:
 * - `capacity` is a positive integer fixed at construction.
 * - `push(value)` appends; when `size === capacity`, the oldest entry is
 *   evicted (drop-oldest overflow policy per supervisor-observation-contract-v1.md
 *   § Internal Queuing).
 * - `snapshot()` returns a NEW plain array in insertion order. The returned
 *   array is a distinct mutable copy: mutating it does not affect the buffer.
 *   (Picked over `Object.freeze(...)` per IP Gate cycle 2 carry-forward —
 *   see completion-report.mdx § Implementation Notes.)
 * - `clear()` empties the buffer; `size` resets to zero.
 * - Not exported from the package barrel (`src/index.ts`) — internal helper.
 */
export class RingBuffer<T> {
  private readonly items: T[] = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('RingBuffer capacity must be positive');
    }
  }

  get size(): number {
    return this.items.length;
  }

  push(value: T): void {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    this.items.push(value);
  }

  snapshot(): T[] {
    // Distinct array copy (not frozen) — callers may mutate freely without
    // affecting the buffer. IP Gate cycle 2 resolution.
    return this.items.slice();
  }

  clear(): void {
    this.items.length = 0;
  }
}
