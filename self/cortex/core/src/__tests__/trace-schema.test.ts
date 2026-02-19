/**
 * Unit tests for ExecutionTrace schema with toolDecisions.
 */
import { describe, it, expect } from 'vitest';
import { ExecutionTraceSchema } from '@nous/shared';
import { randomUUID } from 'node:crypto';

describe('ExecutionTrace schema', () => {
  it('validates trace with toolDecisions', () => {
    const trace = {
      traceId: randomUUID() as import('@nous/shared').TraceId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      turns: [
        {
          input: 'hello',
          output: 'hi',
          modelCalls: [
            {
              providerId: randomUUID(),
              role: 'reasoner',
              durationMs: 100,
            },
          ],
          pfcDecisions: [
            {
              approved: true,
              reason: 'ok',
              confidence: 0.8,
            },
          ],
          toolDecisions: [
            { toolName: 'echo', approved: true, reason: 'ok' },
          ],
          memoryWrites: [] as import('@nous/shared').MemoryEntryId[],
          memoryDenials: [],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = ExecutionTraceSchema.safeParse(trace);
    expect(result.success).toBe(true);
  });

  it('validates trace with memoryDenials', () => {
    const trace = {
      traceId: randomUUID() as import('@nous/shared').TraceId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      turns: [
        {
          input: 'hello',
          output: 'hi',
          modelCalls: [],
          pfcDecisions: [],
          toolDecisions: [],
          memoryWrites: [] as import('@nous/shared').MemoryEntryId[],
          memoryDenials: [
            {
              candidate: {
                content: 'denied',
                type: 'fact',
                scope: 'project',
                confidence: 0.3,
                sensitivity: [],
                retention: 'permanent',
                provenance: {
                  traceId: randomUUID(),
                  source: 'test',
                  timestamp: new Date().toISOString(),
                },
                tags: [],
              },
              reason: 'confidence below threshold',
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = ExecutionTraceSchema.safeParse(trace);
    expect(result.success).toBe(true);
  });

  it('accepts trace with empty toolDecisions (default)', () => {
    const trace = {
      traceId: randomUUID() as import('@nous/shared').TraceId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      turns: [
        {
          input: 'hello',
          output: 'hi',
          modelCalls: [],
          pfcDecisions: [],
          memoryWrites: [] as import('@nous/shared').MemoryEntryId[],
          memoryDenials: [],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const result = ExecutionTraceSchema.safeParse(trace);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turns[0].toolDecisions).toEqual([]);
    }
  });
});
