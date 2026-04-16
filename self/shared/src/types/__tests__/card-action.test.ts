import { describe, expect, it } from 'vitest';
import { CardActionSchema, ActionResultSchema } from '../card-action.js';

describe('CardActionSchema', () => {
  // ── Tier 1: Contract Tests ─────────────────────────────────────────────

  it('accepts valid approve action', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'approve',
      cardId: 'card-1',
      payload: { reason: 'looks good' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid reject action', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'reject',
      cardId: 'card-2',
      payload: { reason: 'not ready' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid navigate action', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'navigate',
      cardId: 'card-3',
      payload: { panel: 'settings' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid submit action with form payload', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'submit',
      cardId: 'card-4',
      payload: { name: 'test', value: 42, nested: { deep: true } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid followup action with prompt', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'followup',
      cardId: 'card-5',
      payload: { prompt: 'Tell me more about this' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid actionType', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'invalid',
      cardId: 'card-1',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing cardId', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'approve',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing payload', () => {
    const result = CardActionSchema.safeParse({
      actionType: 'approve',
      cardId: 'card-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('ActionResultSchema', () => {
  it('accepts valid result with all fields', () => {
    const result = ActionResultSchema.safeParse({
      ok: true,
      message: 'Action submitted',
      traceId: 'trace-abc',
      contentType: 'openui',
    });
    expect(result.success).toBe(true);
  });

  it('accepts result with optional fields omitted', () => {
    const result = ActionResultSchema.safeParse({
      ok: true,
      message: 'Action submitted',
    });
    expect(result.success).toBe(true);
  });

  it('rejects result with ok missing', () => {
    const result = ActionResultSchema.safeParse({
      message: 'Action submitted',
    });
    expect(result.success).toBe(false);
  });

  it('rejects result with message missing', () => {
    const result = ActionResultSchema.safeParse({
      ok: true,
    });
    expect(result.success).toBe(false);
  });
});
