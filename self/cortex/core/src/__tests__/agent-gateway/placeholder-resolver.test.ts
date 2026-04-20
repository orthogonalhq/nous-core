import { describe, expect, it } from 'vitest';
import type { GatewayExecutionContext } from '@nous/shared';
import { resolveDispatchParameterPlaceholders } from '../../agent-gateway/placeholder-resolver.js';

const REAL_UUID = '550e8400-e29b-41d4-a716-446655440104';
const TRACE = '550e8400-e29b-41d4-a716-446655440103';

function execution(projectId: string | undefined): GatewayExecutionContext {
  return {
    projectId: projectId as never,
    traceId: TRACE as never,
    workmodeId: 'system:implementation' as never,
  } as GatewayExecutionContext;
}

describe('resolveDispatchParameterPlaceholders', () => {
  it('substitutes "current" on projectId with execution.projectId', () => {
    const params = { projectId: 'current' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect(result).not.toBe(params); // new object returned
    expect((result as Record<string, unknown>).projectId).toBe(REAL_UUID);
  });

  it('substitutes "this" on project_id with execution.projectId (snake_case key)', () => {
    const params = { project_id: 'this' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect(result).not.toBe(params);
    expect((result as Record<string, unknown>).project_id).toBe(REAL_UUID);
  });

  it('substitutes "<project>" placeholder', () => {
    const params = { projectId: '<project>' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect((result as Record<string, unknown>).projectId).toBe(REAL_UUID);
  });

  it('case-insensitive: "CURRENT" substituted', () => {
    const params = { projectId: 'CURRENT' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect((result as Record<string, unknown>).projectId).toBe(REAL_UUID);
  });

  it('real UUID is left untouched (returns input reference unchanged)', () => {
    const params = { projectId: '11111111-2222-3333-4444-555555555555' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect(result).toBe(params); // referential equality
  });

  it('placeholder pass-through when execution.projectId is undefined', () => {
    const params = { projectId: 'current' };
    const result = resolveDispatchParameterPlaceholders(params, execution(undefined));
    expect(result).toBe(params); // referential equality (no resolution source)
  });

  it('returns input as-is for null params', () => {
    expect(resolveDispatchParameterPlaceholders(null, execution(REAL_UUID))).toBe(null);
  });

  it('returns input as-is for undefined params', () => {
    expect(resolveDispatchParameterPlaceholders(undefined, execution(REAL_UUID))).toBe(undefined);
  });

  it('returns input as-is for non-object params (string, array, number)', () => {
    expect(resolveDispatchParameterPlaceholders('a-string', execution(REAL_UUID))).toBe('a-string');
    const arr = [1, 2, 3];
    expect(resolveDispatchParameterPlaceholders(arr, execution(REAL_UUID))).toBe(arr);
    expect(resolveDispatchParameterPlaceholders(42, execution(REAL_UUID))).toBe(42);
  });

  it('does NOT recurse into nested objects (Invariant I-6)', () => {
    const params = { nested: { projectId: 'current' } };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect(result).toBe(params); // unchanged reference — no recursion
    expect(((params.nested as Record<string, unknown>).projectId)).toBe('current');
  });

  it('does NOT match differently-named keys (e.g., "project")', () => {
    const params = { project: 'current' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect(result).toBe(params);
    expect((params as Record<string, unknown>).project).toBe('current');
  });

  it('substitutes BOTH projectId AND project_id when both are placeholders', () => {
    const params = { projectId: 'current', project_id: 'this', other: 'untouched' };
    const result = resolveDispatchParameterPlaceholders(params, execution(REAL_UUID));
    expect(result).not.toBe(params);
    const obj = result as Record<string, unknown>;
    expect(obj.projectId).toBe(REAL_UUID);
    expect(obj.project_id).toBe(REAL_UUID);
    expect(obj.other).toBe('untouched');
  });
});
