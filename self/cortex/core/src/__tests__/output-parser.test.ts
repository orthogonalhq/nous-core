import { describe, expect, it } from 'vitest';
import { parseModelOutput, type ParsedModelOutput } from '../output-parser.js';
import type { TraceId } from '@nous/shared';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440000' as TraceId;

describe('parseModelOutput — contentType detection', () => {
  // ---------------------------------------------------------------------------
  // Tier 1 — Contract
  // ---------------------------------------------------------------------------

  it('ParsedModelOutput includes optional contentType field', () => {
    const result: ParsedModelOutput = parseModelOutput('hello', TRACE_ID);
    // Type-level: if this compiles, the field exists
    expect(typeof result.contentType === 'string' || result.contentType === undefined).toBe(true);
  });

  it('returns object with contentType property', () => {
    const result = parseModelOutput('test', TRACE_ID);
    expect(result).toHaveProperty('contentType');
  });

  // ---------------------------------------------------------------------------
  // Tier 2 — Behavior
  // ---------------------------------------------------------------------------

  it('plain text input: no prefix, response unchanged, contentType text', () => {
    const result = parseModelOutput('Hello, world!', TRACE_ID);
    expect(result.response).toBe('Hello, world!');
    expect(result.contentType).toBe('text');
  });

  it('%%openui\\n prefixed input: prefix stripped, contentType openui', () => {
    const input = '%%openui\n<StatusCard title="Test" status="active" message="Hello" />';
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.response).toBe('<StatusCard title="Test" status="active" message="Hello" />');
    expect(result.contentType).toBe('openui');
  });

  it('JSON envelope with %%openui\\n in response field: prefix stripped, contentType openui', () => {
    const input = JSON.stringify({
      response: '%%openui\n<StatusCard title="Test" status="active" message="Hi" />',
      toolCalls: [],
      memoryCandidates: [],
    });
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.response).toBe('<StatusCard title="Test" status="active" message="Hi" />');
    expect(result.contentType).toBe('openui');
  });

  it('object input with %%openui\\n in response field: prefix stripped, contentType openui', () => {
    const input = {
      response: '%%openui\n<ActionCard title="Act" description="Do" actions={[]} />',
      toolCalls: [],
    };
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.response).toBe('<ActionCard title="Act" description="Do" actions={[]} />');
    expect(result.contentType).toBe('openui');
  });

  it('empty string: contentType text, empty response', () => {
    const result = parseModelOutput('', TRACE_ID);
    expect(result.response).toBe('');
    expect(result.contentType).toBe('text');
  });

  it('null input: no crash, contentType text', () => {
    const result = parseModelOutput(null, TRACE_ID);
    expect(result.contentType).toBe('text');
  });

  it('undefined input: no crash, contentType text', () => {
    const result = parseModelOutput(undefined, TRACE_ID);
    expect(result.contentType).toBe('text');
  });

  // ---------------------------------------------------------------------------
  // Tier 3 — Edge Cases
  // ---------------------------------------------------------------------------

  it('%%openui without trailing \\n: treated as plain text', () => {
    const result = parseModelOutput('%%openui<StatusCard />', TRACE_ID);
    expect(result.response).toBe('%%openui<StatusCard />');
    expect(result.contentType).toBe('text');
  });

  it('%%openui\\n prefix but no content after: contentType openui, empty response', () => {
    const result = parseModelOutput('%%openui\n', TRACE_ID);
    expect(result.response).toBe('');
    expect(result.contentType).toBe('openui');
  });

  it('multiple %%openui\\n prefixes: only first stripped', () => {
    const result = parseModelOutput('%%openui\n%%openui\n<Card />', TRACE_ID);
    expect(result.response).toBe('%%openui\n<Card />');
    expect(result.contentType).toBe('openui');
  });

  it('JSON envelope with plain text response: contentType text', () => {
    const input = JSON.stringify({
      response: 'Just plain text response.',
      toolCalls: [],
      memoryCandidates: [],
    });
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.response).toBe('Just plain text response.');
    expect(result.contentType).toBe('text');
  });

  it('object input with plain text response: contentType text', () => {
    const result = parseModelOutput({ response: 'Plain text.' }, TRACE_ID);
    expect(result.response).toBe('Plain text.');
    expect(result.contentType).toBe('text');
  });
});
