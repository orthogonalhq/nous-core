/**
 * Stub implementations for IVectorStore and IGraphStore.
 *
 * These fulfill the interface contracts but throw NousError with code
 * 'NOT_IMPLEMENTED' on every method call. Real implementations are
 * available for document/vector stores; these stubs remain for explicit
 * fallback wiring and deferred graph storage implementation.
 */
import { NousError } from '@nous/shared';
import type {
  IVectorStore,
  IGraphStore,
  VectorSearchResult,
  GraphNode,
  VectorFilter,
} from '@nous/shared';

export class StubVectorStore implements IVectorStore {
  async upsert(
    _collection: string,
    _id: string,
    _vector: number[],
    _metadata: Record<string, unknown>,
  ): Promise<void> {
    console.warn(
      '[nous:stub] IVectorStore.upsert() called — not implemented',
    );
    throw new NousError(
      'IVectorStore.upsert() is not implemented — use SqliteVectorStore for a real backend',
      'NOT_IMPLEMENTED',
    );
  }

  async search(
    _collection: string,
    _query: number[],
    _limit: number,
    _filter?: VectorFilter,
  ): Promise<VectorSearchResult[]> {
    console.warn(
      '[nous:stub] IVectorStore.search() called — not implemented',
    );
    throw new NousError(
      'IVectorStore.search() is not implemented — use SqliteVectorStore for a real backend',
      'NOT_IMPLEMENTED',
    );
  }

  async delete(_collection: string, _id: string): Promise<boolean> {
    console.warn(
      '[nous:stub] IVectorStore.delete() called — not implemented',
    );
    throw new NousError(
      'IVectorStore.delete() is not implemented — use SqliteVectorStore for a real backend',
      'NOT_IMPLEMENTED',
    );
  }
}

export class StubGraphStore implements IGraphStore {
  async addNode(
    _id: string,
    _labels: string[],
    _properties: Record<string, unknown>,
  ): Promise<void> {
    console.warn(
      '[nous:stub] IGraphStore.addNode() called — not implemented',
    );
    throw new NousError(
      'IGraphStore.addNode() is not implemented — real implementation in Phase 6',
      'NOT_IMPLEMENTED',
    );
  }

  async addEdge(
    _fromId: string,
    _toId: string,
    _type: string,
    _properties?: Record<string, unknown>,
  ): Promise<void> {
    console.warn(
      '[nous:stub] IGraphStore.addEdge() called — not implemented',
    );
    throw new NousError(
      'IGraphStore.addEdge() is not implemented — real implementation in Phase 6',
      'NOT_IMPLEMENTED',
    );
  }

  async getNeighbors(
    _id: string,
    _edgeType?: string,
    _direction?: 'in' | 'out' | 'both',
  ): Promise<GraphNode[]> {
    console.warn(
      '[nous:stub] IGraphStore.getNeighbors() called — not implemented',
    );
    throw new NousError(
      'IGraphStore.getNeighbors() is not implemented — real implementation in Phase 6',
      'NOT_IMPLEMENTED',
    );
  }

  async deleteNode(_id: string): Promise<boolean> {
    console.warn(
      '[nous:stub] IGraphStore.deleteNode() called — not implemented',
    );
    throw new NousError(
      'IGraphStore.deleteNode() is not implemented — real implementation in Phase 6',
      'NOT_IMPLEMENTED',
    );
  }
}
