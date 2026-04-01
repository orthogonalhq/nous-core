import { describe, expect, it } from 'vitest';
import { CARD_PROMPT_FRAGMENT } from '../../gateway-runtime/card-prompt-fragment.js';

describe('CARD_PROMPT_FRAGMENT — content contract', () => {
  // ── Tier 1: Contract Tests ─────────────────────────────────────────────

  it('contains %%openui format instructions', () => {
    expect(CARD_PROMPT_FRAGMENT).toContain('%%openui');
  });

  it('contains all 5 card type names', () => {
    expect(CARD_PROMPT_FRAGMENT).toContain('StatusCard');
    expect(CARD_PROMPT_FRAGMENT).toContain('ActionCard');
    expect(CARD_PROMPT_FRAGMENT).toContain('ApprovalCard');
    expect(CARD_PROMPT_FRAGMENT).toContain('WorkflowCard');
    expect(CARD_PROMPT_FRAGMENT).toContain('FollowUpBlock');
  });

  it('contains "when to use" guidance', () => {
    expect(CARD_PROMPT_FRAGMENT).toContain('When to use cards');
  });

  it('contains "when NOT to use" guidance', () => {
    expect(CARD_PROMPT_FRAGMENT).toContain('When NOT to use cards');
  });

  it('contains card type reference section', () => {
    expect(CARD_PROMPT_FRAGMENT).toContain('Card type reference');
  });

  it('contains format section', () => {
    expect(CARD_PROMPT_FRAGMENT).toContain('Format:');
    expect(CARD_PROMPT_FRAGMENT).toContain('Prefix card responses with %%openui');
  });

  it('is a non-empty string', () => {
    expect(typeof CARD_PROMPT_FRAGMENT).toBe('string');
    expect(CARD_PROMPT_FRAGMENT.length).toBeGreaterThan(100);
  });
});
