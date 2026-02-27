/**
 * InMemoryEmbedder — IEmbedder implementation for tests and benchmarks.
 *
 * Phase 4.2: Returns deterministic vectors based on text content.
 * Used when a real embedding model is not available.
 */
import type { IEmbedder } from '@nous/shared';

const DEFAULT_DIMENSIONS = 128;

/**
 * Simple deterministic "embedding" from text. Not semantically meaningful;
 * used only for tests and benchmarks.
 */
function deterministicEmbed(text: string, dimensions: number): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    const idx = (i * 7 + text.charCodeAt(i)!) % dimensions;
    vec[idx] = (vec[idx] ?? 0) + (text.charCodeAt(i)! / 255);
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export class InMemoryEmbedder implements IEmbedder {
  constructor(private readonly dimensions = DEFAULT_DIMENSIONS) {}

  async embed(text: string): Promise<number[]> {
    return deterministicEmbed(text, this.dimensions);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getDimensions(): number {
    return this.dimensions;
  }
}
