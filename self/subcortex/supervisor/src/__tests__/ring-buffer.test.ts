/**
 * WR-162 SP 3 UT-2 (part B) — RingBuffer contract.
 */
import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../ring-buffer.js';

describe('RingBuffer', () => {
  it('rejects non-positive capacity on construction', () => {
    expect(() => new RingBuffer(0)).toThrow(
      'RingBuffer capacity must be positive',
    );
    expect(() => new RingBuffer(-1)).toThrow(
      'RingBuffer capacity must be positive',
    );
  });

  it('rejects non-integer capacity on construction', () => {
    expect(() => new RingBuffer(1.5)).toThrow(
      'RingBuffer capacity must be positive',
    );
  });

  it('drops oldest when push overflows capacity', () => {
    const buf = new RingBuffer<number>(1);
    buf.push(1);
    buf.push(2);
    expect(buf.size).toBe(1);
    expect(buf.snapshot()).toEqual([2]);
  });

  it('preserves insertion order when under capacity', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);
    expect(buf.snapshot()).toEqual([1, 2, 3]);
  });

  it('evicts oldest across multiple overflows', () => {
    const buf = new RingBuffer<number>(3);
    for (let i = 1; i <= 6; i++) {
      buf.push(i);
    }
    expect(buf.size).toBe(3);
    expect(buf.snapshot()).toEqual([4, 5, 6]);
  });

  it('snapshot() returns a distinct array (mutation does not affect buffer)', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    const snap = buf.snapshot();
    snap.push(999);
    expect(buf.snapshot()).toEqual([1, 2]);
  });

  it('clear() empties the buffer and resets size', () => {
    const buf = new RingBuffer<string>(3);
    buf.push('a');
    buf.push('b');
    expect(buf.size).toBe(2);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.snapshot()).toEqual([]);
  });
});
