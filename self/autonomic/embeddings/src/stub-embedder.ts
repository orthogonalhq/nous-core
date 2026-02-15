/**
 * StubEmbedder — IEmbedder stub implementation.
 *
 * Throws NousError with code 'NOT_IMPLEMENTED' on every method call.
 * Real implementation arrives in Phase 4.
 */
import { NousError } from '@nous/shared';
import type { IEmbedder } from '@nous/shared';

export class StubEmbedder implements IEmbedder {
  async embed(_text: string): Promise<number[]> {
    console.warn('[nous:stub] IEmbedder.embed() called — not implemented');
    throw new NousError(
      'IEmbedder.embed() is not implemented — real implementation in Phase 4',
      'NOT_IMPLEMENTED',
    );
  }

  async embedBatch(_texts: string[]): Promise<number[][]> {
    console.warn(
      '[nous:stub] IEmbedder.embedBatch() called — not implemented',
    );
    throw new NousError(
      'IEmbedder.embedBatch() is not implemented — real implementation in Phase 4',
      'NOT_IMPLEMENTED',
    );
  }

  getDimensions(): number {
    console.warn(
      '[nous:stub] IEmbedder.getDimensions() called — not implemented',
    );
    throw new NousError(
      'IEmbedder.getDimensions() is not implemented — real implementation in Phase 4',
      'NOT_IMPLEMENTED',
    );
  }
}
