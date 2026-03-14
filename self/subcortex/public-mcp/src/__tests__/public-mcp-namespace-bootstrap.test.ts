import { describe, expect, it } from 'vitest';
import {
  NamespaceRegistryStore,
  deriveExternalCollectionNames,
} from '../namespace-registry-store.js';
import { createMemoryDocumentStore } from './test-store.js';

describe('NamespaceRegistryStore', () => {
  it('creates only external-prefixed collection names', async () => {
    const documentStore = createMemoryDocumentStore();
    const store = new NamespaceRegistryStore(documentStore);

    const record = await store.ensureNamespace({
      namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      clientId: 'client-1',
      clientIdHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      subspace: 'default',
    });

    expect(record.stmCollection.startsWith('external:')).toBe(true);
    expect(record.ltmCollection.startsWith('external:')).toBe(true);
    expect(record.mutationAuditCollection.startsWith('external:')).toBe(true);
    expect(record.tombstoneCollection.startsWith('external:')).toBe(true);
    expect(record.vectorCollection.startsWith('external:')).toBe(true);
    expect(
      Object.values(deriveExternalCollectionNames(record.clientIdHash)).every((value) =>
        value.startsWith('external:'),
      ),
    ).toBe(true);
    expect(record.stmCollection.includes('memory_entries')).toBe(false);
    expect(record.stmCollection.includes('promoted')).toBe(false);
  });
});
