import { describe, expect, it } from 'vitest';
import { createTextAdapter } from '../../../agent-gateway/adapters/text-adapter.js';
import { parseModelOutput } from '../../../output-parser.js';
import type { TraceId } from '@nous/shared';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440103' as TraceId;

describe('createTextAdapter', () => {
  const adapter = createTextAdapter();

  describe('capabilities', () => {
    it('has all capabilities set to false', () => {
      expect(adapter.capabilities).toEqual({
        nativeToolUse: false,
        cacheControl: false,
        extendedThinking: false,
        streaming: false,
      });
    });
  });

  describe('parseResponse', () => {
    it('produces identical output to parseModelOutput for plain text', () => {
      const input = 'Hello world';
      const adapterResult = adapter.parseResponse(input, TRACE_ID);
      const directResult = parseModelOutput(input, TRACE_ID);
      expect(adapterResult.response).toBe(directResult.response);
      expect(adapterResult.toolCalls).toEqual(directResult.toolCalls);
      expect(adapterResult.contentType).toBe(directResult.contentType);
    });

    it('produces identical output to parseModelOutput for JSON envelope', () => {
      const input = JSON.stringify({
        response: 'structured response',
        toolCalls: [{ name: 'test_tool', params: { key: 'val' } }],
      });
      const adapterResult = adapter.parseResponse(input, TRACE_ID);
      const directResult = parseModelOutput(input, TRACE_ID);
      expect(adapterResult.response).toBe(directResult.response);
      expect(adapterResult.toolCalls).toEqual(directResult.toolCalls);
      expect(adapterResult.contentType).toBe(directResult.contentType);
    });

    it('produces identical output to parseModelOutput for object input', () => {
      const input = { response: 'object response' };
      const adapterResult = adapter.parseResponse(input, TRACE_ID);
      const directResult = parseModelOutput(input, TRACE_ID);
      expect(adapterResult.response).toBe(directResult.response);
      expect(adapterResult.toolCalls).toEqual(directResult.toolCalls);
    });
  });

  describe('formatRequest', () => {
    it('passes through string systemPrompt', () => {
      const result = adapter.formatRequest({
        systemPrompt: 'You are an assistant.',
        context: [],
      });
      expect(result.input).toEqual({
        prompt: 'You are an assistant.',
        context: [],
      });
    });

    it('joins string[] systemPrompt with double newline', () => {
      const result = adapter.formatRequest({
        systemPrompt: ['Part one.', 'Part two.'],
        context: [],
      });
      expect(result.input).toEqual({
        prompt: 'Part one.\n\nPart two.',
        context: [],
      });
    });
  });
});
