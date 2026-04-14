import { describe, expect, it } from 'vitest';
import {
  normalizeDispatchOrchestratorParams,
  normalizeDispatchWorkerParams,
} from '../../internal-mcp/request-normalizers.js';

describe('normalizeDispatchOrchestratorParams', () => {
  it('parses camelCase input correctly', () => {
    const result = normalizeDispatchOrchestratorParams({
      dispatchIntent: { type: 'task' },
      taskInstructions: 'Do work',
      budget: { maxTurns: 5 },
    });
    expect(result.dispatchIntent.type).toBe('task');
    expect(result.taskInstructions).toBe('Do work');
    expect(result.budget?.maxTurns).toBe(5);
  });

  it('parses snake_case input correctly', () => {
    const result = normalizeDispatchOrchestratorParams({
      dispatch_intent: { type: 'skill', skillRef: 'test-skill' },
      task_instructions: 'Execute skill',
    });
    expect(result.dispatchIntent.type).toBe('skill');
    expect(result.taskInstructions).toBe('Execute skill');
  });

  it('throws on missing required dispatchIntent', () => {
    expect(() =>
      normalizeDispatchOrchestratorParams({
        taskInstructions: 'Do work',
      }),
    ).toThrow();
  });

  it('throws on missing required taskInstructions', () => {
    expect(() =>
      normalizeDispatchOrchestratorParams({
        dispatchIntent: { type: 'task' },
      }),
    ).toThrow();
  });
});

describe('normalizeDispatchWorkerParams', () => {
  it('parses camelCase input correctly', () => {
    const result = normalizeDispatchWorkerParams({
      taskInstructions: 'Do work',
      nodeDefinitionId: '550e8400-e29b-41d4-a716-446655440099',
      payload: { data: 'test' },
    });
    expect(result.taskInstructions).toBe('Do work');
    expect(result.nodeDefinitionId).toBe('550e8400-e29b-41d4-a716-446655440099');
    expect(result.payload).toEqual({ data: 'test' });
  });

  it('parses snake_case input correctly', () => {
    const result = normalizeDispatchWorkerParams({
      task_instructions: 'Execute task',
      node_id: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.taskInstructions).toBe('Execute task');
    expect(result.nodeDefinitionId).toBe('550e8400-e29b-41d4-a716-446655440099');
  });

  it('throws on missing required taskInstructions', () => {
    expect(() =>
      normalizeDispatchWorkerParams({}),
    ).toThrow();
  });

  it('parses with optional fields absent', () => {
    const result = normalizeDispatchWorkerParams({
      taskInstructions: 'Do work',
    });
    expect(result.taskInstructions).toBe('Do work');
    expect(result.nodeDefinitionId).toBeUndefined();
    expect(result.payload).toBeUndefined();
    expect(result.budget).toBeUndefined();
  });
});
