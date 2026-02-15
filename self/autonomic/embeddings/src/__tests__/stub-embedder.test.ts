import { describe, it, expect } from 'vitest';
import { NousError } from '@nous/shared';
import { StubEmbedder } from '../stub-embedder.js';

describe('StubEmbedder', () => {
  const embedder = new StubEmbedder();

  it('embed() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(embedder.embed('text')).rejects.toThrow(NousError);
    await expect(embedder.embed('text')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('embedBatch() throws NousError with code NOT_IMPLEMENTED', async () => {
    await expect(embedder.embedBatch(['a', 'b'])).rejects.toThrow(NousError);
    await expect(embedder.embedBatch(['a', 'b'])).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('getDimensions() throws NousError with code NOT_IMPLEMENTED', () => {
    expect(() => embedder.getDimensions()).toThrow(NousError);
    try {
      embedder.getDimensions();
    } catch (err) {
      expect((err as NousError).code).toBe('NOT_IMPLEMENTED');
    }
  });
});
