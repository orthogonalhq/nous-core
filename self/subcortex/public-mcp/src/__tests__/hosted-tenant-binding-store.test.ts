import { describe, expect, it } from 'vitest';
import { HostedTenantBindingStore } from '../hosted-tenant-binding-store.js';
import { createMemoryDocumentStore } from './test-store.js';

describe('HostedTenantBindingStore', () => {
  it('stores and resolves hosted tenant bindings by id, host, and user handle', async () => {
    const store = new HostedTenantBindingStore(createMemoryDocumentStore());

    await store.save({
      bindingId: 'binding-1',
      tenantId: 'tenant-1',
      userHandle: 'andre',
      host: 'Andre.Nous.Run',
      storePrefix: 'tenant-andre',
      serverName: 'Andre Hosted Nous',
      phase: 'phase-13.5',
      status: 'active',
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z',
    });

    expect((await store.get('binding-1'))?.tenantId).toBe('tenant-1');
    expect((await store.getByHost('andre.nous.run'))?.userHandle).toBe('andre');
    expect((await store.getByUserHandle('andre'))?.storePrefix).toBe('tenant-andre');
  });

  it('resolves seeded hosted bindings before document-store reads', async () => {
    const store = new HostedTenantBindingStore(createMemoryDocumentStore(), {
      seedRecords: [
        {
          bindingId: 'seed-1',
          tenantId: 'tenant-seed',
          userHandle: 'seeded',
          host: 'seeded.nous.run',
          storePrefix: 'tenant-seeded',
          serverName: 'Seeded Hosted Nous',
          phase: 'phase-13.5',
          status: 'active',
          createdAt: '2026-03-14T00:00:00.000Z',
          updatedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    expect((await store.getByHost('seeded.nous.run'))?.bindingId).toBe('seed-1');
  });
});
