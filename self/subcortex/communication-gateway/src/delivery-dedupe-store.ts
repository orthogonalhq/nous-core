import type { CommunicationDeliveryAttempt } from '@nous/shared';
import { DocumentCommunicationStore } from './document-communication-store.js';

export class DeliveryDedupeStore {
  constructor(private readonly store: DocumentCommunicationStore) {}

  async getByEgressId(
    egressId: string,
  ): Promise<CommunicationDeliveryAttempt | null> {
    return this.store.getLatestDeliveryAttemptByEgressId(egressId);
  }
}
