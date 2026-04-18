import { describe, expect, it } from 'vitest';
import { NousError } from '@nous/shared';
import {
  buildUnknownToolError,
  formatZodMessage,
  isSimilarToolName,
  isToolErrorPayload,
  isZodLikeError,
  type ToolErrorPayload,
} from '../../internal-mcp/tool-error-helpers.js';

describe('tool-error-helpers', () => {
  describe('buildUnknownToolError', () => {
    it('produces a NousError whose message includes "Available tools:" with the comma-separated list', () => {
      const err = buildUnknownToolError({
        requestedName: 'unknown_thing',
        agentClass: 'Cortex::Principal',
        available: ['workflow_list', 'memory_search'],
      });
      expect(err).toBeInstanceOf(NousError);
      expect(err.code).toBe('TOOL_NOT_AVAILABLE');
      expect(err.message).toContain('Available tools: workflow_list, memory_search.');
    });

    it('includes "Did you mean:" suggestion when at least one similar candidate exists', () => {
      const err = buildUnknownToolError({
        requestedName: 'workflow_manager.list_workflows',
        agentClass: 'Cortex::Principal',
        available: ['workflow_list', 'memory_search', 'task_complete'],
      });
      expect(err.message).toContain('Did you mean:');
      expect(err.message).toContain('workflow_list');
    });

    it('OMITS "Did you mean:" when no candidate is similar', () => {
      const err = buildUnknownToolError({
        requestedName: 'totally_unrelated_xyz',
        agentClass: 'Cortex::Principal',
        available: ['abc', 'def'],
      });
      expect(err.message).not.toContain('Did you mean:');
    });

    it('NousError.context carries the structured ToolErrorPayload (unknown_tool)', () => {
      const err = buildUnknownToolError({
        requestedName: 'workflow_manager',
        agentClass: 'Cortex::Principal',
        available: ['workflow_list'],
      });
      const ctx = err.context as ToolErrorPayload;
      expect(ctx.tool_error_kind).toBe('unknown_tool');
      expect(ctx.requested_tool).toBe('workflow_manager');
      expect(ctx.available_tools).toEqual(['workflow_list']);
      expect(ctx.suggestions).toEqual(['workflow_list']);
    });

    it('bounds the suggestions list to at most 3 entries even when more match', () => {
      const err = buildUnknownToolError({
        requestedName: 'workflow_x',
        agentClass: 'Cortex::Principal',
        available: ['workflow_list', 'workflow_status', 'workflow_inspect', 'workflow_validate', 'workflow_create'],
      });
      const ctx = err.context as ToolErrorPayload;
      expect(ctx.suggestions?.length).toBe(3);
    });
  });

  describe('isToolErrorPayload', () => {
    it('returns true for valid unknown_tool payload', () => {
      const payload: ToolErrorPayload = { tool_error_kind: 'unknown_tool', requested_tool: 't' };
      expect(isToolErrorPayload(payload)).toBe(true);
    });

    it('returns true for valid arguments_invalid payload', () => {
      const payload: ToolErrorPayload = { tool_error_kind: 'arguments_invalid', requested_tool: 't' };
      expect(isToolErrorPayload(payload)).toBe(true);
    });

    it('returns true for valid tool_runtime_error payload', () => {
      const payload: ToolErrorPayload = { tool_error_kind: 'tool_runtime_error', requested_tool: 't' };
      expect(isToolErrorPayload(payload)).toBe(true);
    });

    it('returns false for null/undefined/primitives, missing fields, or unknown kinds', () => {
      expect(isToolErrorPayload(null)).toBe(false);
      expect(isToolErrorPayload(undefined)).toBe(false);
      expect(isToolErrorPayload('a string')).toBe(false);
      expect(isToolErrorPayload(42)).toBe(false);
      expect(isToolErrorPayload({ requested_tool: 't' })).toBe(false);
      expect(isToolErrorPayload({ tool_error_kind: 'unknown_tool' })).toBe(false);
      expect(isToolErrorPayload({
        tool_error_kind: 'made_up_kind',
        requested_tool: 't',
      })).toBe(false);
    });
  });

  describe('isSimilarToolName', () => {
    it('positive: workflow_manager.list_workflows ↔ workflow_list matches via shared substring (>=4)', () => {
      expect(isSimilarToolName('workflow_manager.list_workflows', 'workflow_list')).toBe(true);
    });

    it('negative: task_complete ↔ workflow_list does NOT match', () => {
      expect(isSimilarToolName('task_complete', 'workflow_list')).toBe(false);
    });

    it('edge: empty strings return false', () => {
      expect(isSimilarToolName('', 'workflow_list')).toBe(false);
      expect(isSimilarToolName('workflow_list', '')).toBe(false);
      expect(isSimilarToolName('', '')).toBe(false);
    });

    it('edge: identical strings return false (would be useless suggestion)', () => {
      expect(isSimilarToolName('workflow_list', 'workflow_list')).toBe(false);
    });

    it('Levenshtein-only positive: typo within distance 4', () => {
      expect(isSimilarToolName('wrkflow_lst', 'workflow_list')).toBe(true);
    });

    it('case-insensitive: WORKFLOW_LIST matches workflow_list as identical (returns false)', () => {
      // identical-when-lowercased → false (same suggestion would be useless)
      expect(isSimilarToolName('WORKFLOW_LIST', 'workflow_list')).toBe(false);
      // case-insensitive substring match across different shapes
      expect(isSimilarToolName('WORKFLOW_MANAGER', 'workflow_list')).toBe(true);
    });
  });

  describe('isZodLikeError', () => {
    it('returns true for an object with .issues array (ZodError v3 shape)', () => {
      expect(isZodLikeError({ issues: [{ path: ['x'], message: 'bad' }] })).toBe(true);
    });

    it('returns true for an object with constructor name === ZodError', () => {
      class ZodError {
        someField = 'value';
      }
      expect(isZodLikeError(new ZodError())).toBe(true);
    });

    it('returns false for null, primitives, plain Error, or unrelated objects', () => {
      expect(isZodLikeError(null)).toBe(false);
      expect(isZodLikeError(undefined)).toBe(false);
      expect(isZodLikeError('string')).toBe(false);
      expect(isZodLikeError(new Error('plain'))).toBe(false);
      expect(isZodLikeError({ message: 'no issues field' })).toBe(false);
    });
  });

  describe('formatZodMessage', () => {
    it('joins issues with semicolons and includes path: message', () => {
      const e = {
        issues: [
          { path: ['projectId'], message: 'must be a UUID' },
          { path: ['status'], message: 'expected array' },
        ],
      };
      expect(formatZodMessage(e)).toBe('projectId: must be a UUID; status: expected array');
    });

    it('renders empty path as (root)', () => {
      const e = { issues: [{ path: [], message: 'invalid root' }] };
      expect(formatZodMessage(e)).toBe('(root): invalid root');
    });

    it('falls back to .message when .issues is empty/missing', () => {
      expect(formatZodMessage({ issues: [], message: 'fallback' })).toBe('fallback');
      expect(formatZodMessage({ message: 'no issues at all' })).toBe('no issues at all');
    });
  });
});
