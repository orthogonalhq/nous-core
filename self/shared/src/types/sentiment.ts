/**
 * Sentiment weight mapping for Nous-OSS.
 *
 * Phase 4.1: Canonical numeric mapping for retrieval scoring and confidence consumers.
 * From memory-system.md — strong signals (positive or negative) weight higher than weak.
 */
import type { Sentiment } from './enums.js';

/** Canonical mapping from Sentiment to numeric weight. Strong signals = ±1.0, weak = ±0.5, neutral = 0. */
export const SENTIMENT_WEIGHT_MAP: Record<Sentiment, number> = {
  'strong-positive': 1.0,
  'weak-positive': 0.5,
  neutral: 0,
  'weak-negative': -0.5,
  'strong-negative': -1.0,
};

/**
 * Returns the canonical weight for a sentiment value.
 * Used by phase-4.2 retrieval for sentimentWeight component.
 */
export function getSentimentWeight(sentiment: Sentiment): number {
  return SENTIMENT_WEIGHT_MAP[sentiment];
}
