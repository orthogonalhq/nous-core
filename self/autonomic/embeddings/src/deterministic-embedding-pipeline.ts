/**
 * DeterministicEmbeddingPipeline — validated embedder wrapper with provenance.
 *
 * Phase 8.1: Normalizes input, validates dimensions, and emits deterministic
 * generation metadata for vector indexing and audit linkage.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  IEmbedder,
  EmbeddingModelProvenance,
  EmbeddingGenerationRecord,
  VectorIndexMetadata,
  MemoryEntryId,
  MemoryType,
  MemoryScope,
  ProjectId,
  TraceId,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  ValidationError,
  EmbeddingModelProvenanceSchema,
  EmbeddingGenerationRecordSchema,
  VectorIndexMetadataSchema,
} from '@nous/shared';

const DEFAULT_TOKENS_PER_CHAR = 1 / 4;

export interface DeterministicEmbeddingPipelineOptions {
  embedder: IEmbedder;
  profile: EmbeddingModelProvenance;
  idFactory?: () => string;
  now?: () => string;
  tokensPerChar?: number;
}

export interface EmbedTextResult {
  vector: number[];
  normalizedText: string;
  tokenEstimate: number;
  generation: EmbeddingGenerationRecord;
}

export interface EmbedBatchResult {
  vectors: number[][];
  normalizedTexts: string[];
  tokenEstimates: number[];
  generations: EmbeddingGenerationRecord[];
}

export interface BuildIndexMetadataInput {
  memoryEntryId: MemoryEntryId;
  memoryType: MemoryType;
  scope: MemoryScope;
  projectId?: ProjectId;
  traceId: TraceId;
  evidenceRefs: TraceEvidenceReference[];
  tokenEstimate: number;
  generation: EmbeddingGenerationRecord;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function estimateTokens(text: string, tokensPerChar: number): number {
  return Math.ceil(text.length * tokensPerChar);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validateVectorDimensions(
  vector: number[],
  expectedDimensions: number,
): void {
  if (vector.length !== expectedDimensions) {
    throw new ValidationError(
      'Embedding dimensions mismatch',
      [
        {
          path: 'vector.length',
          message: `Expected ${expectedDimensions} dimensions, got ${vector.length}`,
        },
      ],
    );
  }
}

function validateVectorValues(vector: number[]): void {
  const invalidIndex = vector.findIndex(
    (value) => !Number.isFinite(value),
  );
  if (invalidIndex >= 0) {
    throw new ValidationError(
      'Embedding contains non-finite values',
      [
        {
          path: `vector[${invalidIndex}]`,
          message: 'Embedding values must be finite numbers',
        },
      ],
    );
  }
}

export class DeterministicEmbeddingPipeline {
  private readonly idFactory: () => string;

  private readonly now: () => string;

  private readonly tokensPerChar: number;

  private readonly profile: EmbeddingModelProvenance;

  constructor(private readonly options: DeterministicEmbeddingPipelineOptions) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.tokensPerChar = options.tokensPerChar ?? DEFAULT_TOKENS_PER_CHAR;
    const parsedProfile = EmbeddingModelProvenanceSchema.safeParse(
      options.profile,
    );
    if (!parsedProfile.success) {
      const errors = parsedProfile.error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError('Invalid embedding profile', errors);
    }
    this.profile = parsedProfile.data;

    const embedderDimensions = options.embedder.getDimensions();
    if (embedderDimensions !== this.profile.dimensions) {
      throw new ValidationError(
        'Embedder/profile dimensions mismatch',
        [
          {
            path: 'profile.dimensions',
            message: `Profile=${this.profile.dimensions}, embedder=${embedderDimensions}`,
          },
        ],
      );
    }
  }

  async embedText(text: string): Promise<EmbedTextResult> {
    const normalizedText = normalizeText(text);
    if (!normalizedText) {
      throw new ValidationError('Cannot embed empty text', [
        { path: 'text', message: 'Text must be non-empty after normalization' },
      ]);
    }

    const vector = await this.options.embedder.embed(normalizedText);
    validateVectorDimensions(vector, this.profile.dimensions);
    validateVectorValues(vector);

    const generationResult = EmbeddingGenerationRecordSchema.safeParse({
      requestId: this.idFactory(),
      generatedAt: this.now(),
      inputHash: sha256(normalizedText),
      profile: this.profile,
    });
    if (!generationResult.success) {
      const errors = generationResult.error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError('Invalid embedding generation record', errors);
    }

    return {
      vector,
      normalizedText,
      tokenEstimate: estimateTokens(normalizedText, this.tokensPerChar),
      generation: generationResult.data,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbedBatchResult> {
    if (texts.length === 0) {
      return {
        vectors: [],
        normalizedTexts: [],
        tokenEstimates: [],
        generations: [],
      };
    }

    const vectors: number[][] = [];
    const normalizedTexts: string[] = [];
    const tokenEstimates: number[] = [];
    const generations: EmbeddingGenerationRecord[] = [];

    for (const text of texts) {
      const result = await this.embedText(text);
      vectors.push(result.vector);
      normalizedTexts.push(result.normalizedText);
      tokenEstimates.push(result.tokenEstimate);
      generations.push(result.generation);
    }

    return {
      vectors,
      normalizedTexts,
      tokenEstimates,
      generations,
    };
  }

  buildIndexMetadata(input: BuildIndexMetadataInput): VectorIndexMetadata {
    const parsed = VectorIndexMetadataSchema.safeParse({
      memoryEntryId: input.memoryEntryId,
      memoryType: input.memoryType,
      scope: input.scope,
      projectId: input.projectId,
      traceId: input.traceId,
      evidenceRefs: input.evidenceRefs,
      tokenEstimate: input.tokenEstimate,
      embedding: input.generation,
    });
    if (!parsed.success) {
      const errors = parsed.error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
      throw new ValidationError('Invalid vector index metadata', errors);
    }
    return parsed.data;
  }
}

