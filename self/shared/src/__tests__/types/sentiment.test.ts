/**
 * Unit tests for SENTIMENT_WEIGHT_MAP and getSentimentWeight.
 */
import { describe, it, expect } from 'vitest';
import { SENTIMENT_WEIGHT_MAP, getSentimentWeight } from '../../types/sentiment.js';

describe('SENTIMENT_WEIGHT_MAP', () => {
  it('has all five Sentiment keys', () => {
    const keys = Object.keys(SENTIMENT_WEIGHT_MAP);
    expect(keys).toContain('strong-positive');
    expect(keys).toContain('weak-positive');
    expect(keys).toContain('neutral');
    expect(keys).toContain('weak-negative');
    expect(keys).toContain('strong-negative');
    expect(keys).toHaveLength(5);
  });

  it('maps strong-positive to 1.0', () => {
    expect(SENTIMENT_WEIGHT_MAP['strong-positive']).toBe(1.0);
  });

  it('maps weak-positive to 0.5', () => {
    expect(SENTIMENT_WEIGHT_MAP['weak-positive']).toBe(0.5);
  });

  it('maps neutral to 0', () => {
    expect(SENTIMENT_WEIGHT_MAP.neutral).toBe(0);
  });

  it('maps weak-negative to -0.5', () => {
    expect(SENTIMENT_WEIGHT_MAP['weak-negative']).toBe(-0.5);
  });

  it('maps strong-negative to -1.0', () => {
    expect(SENTIMENT_WEIGHT_MAP['strong-negative']).toBe(-1.0);
  });
});

describe('getSentimentWeight', () => {
  it('returns 1.0 for strong-positive', () => {
    expect(getSentimentWeight('strong-positive')).toBe(1.0);
  });

  it('returns 0.5 for weak-positive', () => {
    expect(getSentimentWeight('weak-positive')).toBe(0.5);
  });

  it('returns 0 for neutral', () => {
    expect(getSentimentWeight('neutral')).toBe(0);
  });

  it('returns -0.5 for weak-negative', () => {
    expect(getSentimentWeight('weak-negative')).toBe(-0.5);
  });

  it('returns -1.0 for strong-negative', () => {
    expect(getSentimentWeight('strong-negative')).toBe(-1.0);
  });

  it('handles all enum values from map', () => {
    const sentiments = Object.keys(SENTIMENT_WEIGHT_MAP) as Array<
      keyof typeof SENTIMENT_WEIGHT_MAP
    >;
    for (const s of sentiments) {
      const w = getSentimentWeight(s);
      expect(typeof w).toBe('number');
      expect(w).toBeGreaterThanOrEqual(-1);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});
