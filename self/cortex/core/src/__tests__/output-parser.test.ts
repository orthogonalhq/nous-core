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
    const input = '%%openui\n<StatusCard title="Test" status="active" description="Hello" />';
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.response).toBe('<StatusCard title="Test" status="active" description="Hello" />');
    expect(result.contentType).toBe('openui');
  });

  it('JSON envelope with %%openui\\n in response field: prefix stripped, contentType openui', () => {
    const input = JSON.stringify({
      response: '%%openui\n<StatusCard title="Test" status="active" description="Hi" />',
      toolCalls: [],
      memoryCandidates: [],
    });
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.response).toBe('<StatusCard title="Test" status="active" description="Hi" />');
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

  it('%%openui without trailing \\n: prefix not stripped, but inline <StatusCard detected as openui', () => {
    const result = parseModelOutput('%%openui<StatusCard />', TRACE_ID);
    // Prefix not stripped (no \n), but <StatusCard tag detected inline
    expect(result.response).toBe('%%openui<StatusCard />');
    expect(result.contentType).toBe('openui');
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

  // ---------------------------------------------------------------------------
  // Tier 2 — Inline card tag detection (Phase 2.1)
  // ---------------------------------------------------------------------------

  it('inline <StatusCard without prefix: contentType openui, response unchanged', () => {
    const input = 'Here are results:\n<StatusCard title="Done" status="complete" description="OK" />';
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.contentType).toBe('openui');
    expect(result.response).toBe(input);
  });

  it('mixed prose with <ActionCard inline: contentType openui', () => {
    const input = 'Try this:\n<ActionCard title="Go" description="Now" actions={[]} />\nDone.';
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.contentType).toBe('openui');
    expect(result.response).toBe(input);
  });

  it('%%openui\\n prefix backward compat: prefix stripped, contentType openui', () => {
    const input = '%%openui\n<StatusCard title="T" status="active" description="M" />';
    const result = parseModelOutput(input, TRACE_ID);
    expect(result.contentType).toBe('openui');
    expect(result.response).toBe('<StatusCard title="T" status="active" description="M" />');
  });

  it('plain text with no card tags: contentType text', () => {
    const result = parseModelOutput('Just explaining something.', TRACE_ID);
    expect(result.contentType).toBe('text');
    expect(result.response).toBe('Just explaining something.');
  });

  it('non-registered <SomeComponent> tag: contentType text', () => {
    const result = parseModelOutput('<SomeComponent prop="val" />', TRACE_ID);
    expect(result.contentType).toBe('text');
  });

  it('prefix present but no card tags after stripping: contentType openui (backward compat)', () => {
    const result = parseModelOutput('%%openui\nJust some text', TRACE_ID);
    expect(result.contentType).toBe('openui');
    expect(result.response).toBe('Just some text');
  });
});
