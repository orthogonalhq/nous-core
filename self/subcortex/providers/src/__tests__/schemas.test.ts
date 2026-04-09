import { describe, expect, it } from 'vitest';
import { TextModelInputSchema } from '../schemas.js';

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests (backward compatibility)
// ---------------------------------------------------------------------------

describe('TextModelInputSchema — backward compatibility', () => {
  it('parses prompt-only input', () => {
    const result = TextModelInputSchema.safeParse({ prompt: 'hello' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ prompt: 'hello' });
    }
  });

  it('parses messages-only input', () => {
    const input = {
      messages: [
        { role: 'user' as const, content: 'hello' },
        { role: 'assistant' as const, content: 'hi' },
      ],
    };
    const result = TextModelInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });
});

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests (new fields)
// ---------------------------------------------------------------------------

describe('TextModelInputSchema — new fields', () => {
  it('parses prompt with tools and systemSegments', () => {
    const input = {
      prompt: 'hello',
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object' },
        },
      ],
      systemSegments: ['segment-1', 'segment-2'],
    };
    const result = TextModelInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('parses messages with tools', () => {
    const input = {
      messages: [{ role: 'user' as const, content: 'hello' }],
      tools: [
        {
          name: 'search',
          description: 'Search tool',
          input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    };
    const result = TextModelInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('parses messages with systemSegments', () => {
    const input = {
      messages: [{ role: 'system' as const, content: 'You are helpful' }],
      systemSegments: ['cache-boundary-1'],
    };
    const result = TextModelInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Behavior Tests
// ---------------------------------------------------------------------------

describe('TextModelInputSchema — behavior', () => {
  it('optional fields can be omitted without error (prompt branch)', () => {
    const result = TextModelInputSchema.safeParse({ prompt: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      // tools and systemSegments should not appear in output
      expect('tools' in result.data).toBe(false);
      expect('systemSegments' in result.data).toBe(false);
    }
  });

  it('optional fields can be omitted without error (messages branch)', () => {
    const result = TextModelInputSchema.safeParse({
      messages: [{ role: 'user' as const, content: 'test' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('tools' in result.data).toBe(false);
      expect('systemSegments' in result.data).toBe(false);
    }
  });
});
