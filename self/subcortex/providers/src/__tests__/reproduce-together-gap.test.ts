import { describe, it, expect } from 'vitest';
import { resolveProviderDefinition } from '../provider-definitions.js';

describe('together AI provider (reproduction — issue #310)', () => {
  it('does not yet exist as a recognized vendor key', () => {
    expect(() => resolveProviderDefinition('together' as any)).toThrow(
      /missing for vendor key 'together'/,
    );
  });
});