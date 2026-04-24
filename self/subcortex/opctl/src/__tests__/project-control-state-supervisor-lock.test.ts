/**
 * WR-162 SP 5 — UT-OP1 — `InMemoryProjectControlStateStore` supervisor-lock
 * extension (SUPV-SP5-009/010).
 *
 * Asserts the three new methods (`getSupervisorLock` /
 * `setSupervisorLock` / `clearSupervisorLock`) operate exclusively on the
 * lock-field half of the record and do not disturb the SP 3 `state` half.
 * Cross-project isolation is also covered.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ProjectId } from '@nous/shared';
import { InMemoryProjectControlStateStore } from '../project-control-state.js';

describe('InMemoryProjectControlStateStore — supervisor lock (UT-OP1)', () => {
  it('returns default unlocked snapshot for an unknown project', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pid = randomUUID() as ProjectId;
    const snap = await store.getSupervisorLock(pid);
    expect(snap).toEqual({
      locked: false,
      sup_code: null,
      severity: null,
      set_at: null,
    });
  });

  it('setSupervisorLock persists provenance → getSupervisorLock reads back', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pid = randomUUID() as ProjectId;
    await store.setSupervisorLock(pid, {
      sup_code: 'SUP-001',
      severity: 'S0',
      set_at: '2026-04-22T12:00:00.000Z',
    });
    const snap = await store.getSupervisorLock(pid);
    expect(snap.locked).toBe(true);
    expect(snap.sup_code).toBe('SUP-001');
    expect(snap.severity).toBe('S0');
    expect(snap.set_at).toBe('2026-04-22T12:00:00.000Z');
  });

  it('clearSupervisorLock resets to default snapshot', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pid = randomUUID() as ProjectId;
    await store.setSupervisorLock(pid, {
      sup_code: 'SUP-003',
      severity: 'S1',
      set_at: '2026-04-22T12:00:00.000Z',
    });
    await store.clearSupervisorLock(pid);
    const snap = await store.getSupervisorLock(pid);
    expect(snap).toEqual({
      locked: false,
      sup_code: null,
      severity: null,
      set_at: null,
    });
  });

  it('SP 3 set("paused_review") does NOT touch lock fields (non-interference)', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pid = randomUUID() as ProjectId;
    await store.setSupervisorLock(pid, {
      sup_code: 'SUP-001',
      severity: 'S0',
      set_at: '2026-04-22T12:00:00.000Z',
    });
    await store.set(pid, 'paused_review');
    const snap = await store.getSupervisorLock(pid);
    expect(snap.locked).toBe(true);
    expect(snap.sup_code).toBe('SUP-001');
    expect(await store.get(pid)).toBe('paused_review');
  });

  it('SP 3 clear() does NOT touch lock fields (non-interference)', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pid = randomUUID() as ProjectId;
    await store.setSupervisorLock(pid, {
      sup_code: 'SUP-001',
      severity: 'S0',
      set_at: '2026-04-22T12:00:00.000Z',
    });
    await store.set(pid, 'paused_review');
    await store.clear(pid);
    expect(await store.get(pid)).toBeNull();
    const snap = await store.getSupervisorLock(pid);
    expect(snap.locked).toBe(true);
    expect(snap.sup_code).toBe('SUP-001');
  });

  it('setSupervisorLock does NOT touch state half (non-interference)', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pid = randomUUID() as ProjectId;
    await store.set(pid, 'paused_review');
    await store.setSupervisorLock(pid, {
      sup_code: 'SUP-001',
      severity: 'S0',
      set_at: '2026-04-22T12:00:00.000Z',
    });
    expect(await store.get(pid)).toBe('paused_review');
  });

  it('cross-project isolation — locking project A does not affect project B', async () => {
    const store = new InMemoryProjectControlStateStore();
    const pidA = randomUUID() as ProjectId;
    const pidB = randomUUID() as ProjectId;
    await store.setSupervisorLock(pidA, {
      sup_code: 'SUP-001',
      severity: 'S0',
      set_at: '2026-04-22T12:00:00.000Z',
    });
    const snapB = await store.getSupervisorLock(pidB);
    expect(snapB.locked).toBe(false);
  });
});
