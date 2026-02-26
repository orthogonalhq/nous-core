/**
 * Phase 4.1: Contract verification.
 *
 * Verifies experience-record and sentiment contract exports and policy path coverage.
 */
import { describe, it, expect } from 'vitest';
import {
  ExperienceRecordWriteCandidateSchema,
  SENTIMENT_WEIGHT_MAP,
  getSentimentWeight,
} from '@nous/shared';
import {
  buildPolicyAccessContextForMemoryWrite,
  isCrossProjectMemoryWrite,
} from '@nous/memory-access';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('phase-4.1 contract verification', () => {
  describe('@nous/shared exports', () => {
    it('exports ExperienceRecordWriteCandidateSchema', () => {
      expect(ExperienceRecordWriteCandidateSchema).toBeDefined();
      expect(typeof ExperienceRecordWriteCandidateSchema.safeParse).toBe('function');
    });

    it('exports SENTIMENT_WEIGHT_MAP', () => {
      expect(SENTIMENT_WEIGHT_MAP).toBeDefined();
      expect(SENTIMENT_WEIGHT_MAP['strong-positive']).toBe(1.0);
      expect(SENTIMENT_WEIGHT_MAP['strong-negative']).toBe(-1.0);
    });

    it('exports getSentimentWeight', () => {
      expect(getSentimentWeight).toBeDefined();
      expect(typeof getSentimentWeight).toBe('function');
      expect(getSentimentWeight('neutral')).toBe(0);
    });
  });

  describe('policy path coverage for experience-record', () => {
    const experienceRecordCandidate = {
      content: 'Kitchen gut rejected',
      type: 'experience-record' as const,
      scope: 'global' as const,
      projectId: VALID_UUID,
      confidence: 0.85,
      sensitivity: [] as string[],
      retention: 'permanent' as const,
      provenance: {
        traceId: VALID_UUID,
        source: 'pfc',
        timestamp: NOW,
      },
      tags: ['real-estate'],
      sentiment: 'strong-negative' as const,
      context: '3-bed property',
      action: 'Submitted for review',
      outcome: 'rejected',
      reason: 'Repair estimate exceeded',
    };

    it('isCrossProjectMemoryWrite returns true for experience-record with scope=global', () => {
      const result = isCrossProjectMemoryWrite(
        experienceRecordCandidate,
        VALID_UUID as any,
      );
      expect(result).toBe(true);
    });

    it('buildPolicyAccessContextForMemoryWrite produces valid context for experience-record cross-project write', () => {
      const projectConfig = {
        id: VALID_UUID,
        name: 'test',
        type: 'protocol' as const,
        memoryAccessPolicy: {
          canReadFrom: 'all' as const,
          canBeReadBy: 'all' as const,
          inheritsGlobal: true,
        },
      };
      const result = buildPolicyAccessContextForMemoryWrite({
        candidate: experienceRecordCandidate,
        actingProjectId: VALID_UUID as any,
        actingProjectConfig: projectConfig as any,
        projectControlState: 'running' as any,
        traceId: VALID_UUID as any,
      });
      expect(result).not.toBeNull();
      expect(result?.action).toBe('retrieve');
      expect(result?.fromProjectId).toBe(VALID_UUID);
      expect(result?.includeGlobal).toBe(true);
    });
  });
});
