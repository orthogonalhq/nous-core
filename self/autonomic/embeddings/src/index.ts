/**
 * @nous/autonomic-embeddings — Embedding model abstraction for Nous-OSS.
 */
export { StubEmbedder } from './stub-embedder.js';
export { InMemoryEmbedder } from './in-memory-embedder.js';
export {
  DeterministicEmbeddingPipeline,
  type DeterministicEmbeddingPipelineOptions,
  type EmbedTextResult,
  type EmbedBatchResult,
  type BuildIndexMetadataInput,
} from './deterministic-embedding-pipeline.js';
