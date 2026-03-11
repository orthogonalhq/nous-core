import { describe, expect, it } from 'vitest';
import { BridgeRuntime } from '../bridge-runtime.js';
import { TelegramBotAdapter } from '../connectors/telegram-bot-adapter.js';

const NOW = '2026-03-11T00:00:00.000Z';

function createMemoryDocumentStore() {
  const collections = new Map<string, Map<string, unknown>>();
  return {
    async put<T>(collection: string, id: string, document: T): Promise<void> {
      if (!collections.has(collection)) {
        collections.set(collection, new Map());
      }
      collections.get(collection)?.set(id, document);
    },
    async get<T>(collection: string, id: string): Promise<T | null> {
      return (collections.get(collection)?.get(id) as T | undefined) ?? null;
    },
    async query<T>(collection: string): Promise<T[]> {
      return Array.from(collections.get(collection)?.values() ?? []) as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return collections.get(collection)?.delete(id) ?? false;
    },
  };
}

describe('BridgeRuntime', () => {
  it('composes the communication gateway in-process and routes ingress through the gateway seam', async () => {
    const adapter = new TelegramBotAdapter({
      accountId: 'account:telegram',
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544091${sequence++}`;
      })(),
      payloadRefResolver: () => 'project:message',
    });
    const runtime = new BridgeRuntime({
      adapter,
      documentStore: createMemoryDocumentStore() as any,
      authorizedAccountIds: ['account:telegram'],
      allowGroupConversations: true,
      allowThreads: true,
      requireMentionForSharedConversations: false,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544092${sequence++}`;
      })(),
    });

    await runtime.gatewayService.upsertBinding({
      channel: 'telegram',
      account_id: 'account:telegram',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'verified',
      evidence_refs: ['binding:1'],
    });

    const outcome = await runtime.handleTelegramUpdate({
      update_id: 'update:1',
      message: {
        message_id: 'message:1',
        date: 1773187200,
        text: 'hello',
        from: {
          id: 'user:1',
          username: 'principal',
        },
        chat: {
          id: 'project:550e8400-e29b-41d4-a716-446655440923',
          type: 'private',
        },
      },
    });

    expect(outcome.outcome).toBe('accepted_routed');
  });

  it('dispatches Telegram messages through the composed gateway runtime', async () => {
    let delivered = 0;
    const adapter = new TelegramBotAdapter({
      accountId: 'account:telegram',
      now: () => NOW,
      transport: {
        async sendMessage() {
          delivered += 1;
          return {
            outcome: 'sent',
            providerMessageRef: 'telegram:message:1',
          } as const;
        },
      },
    });
    const runtime = new BridgeRuntime({
      adapter,
      documentStore: createMemoryDocumentStore() as any,
      authorizedAccountIds: ['account:telegram'],
      allowGroupConversations: true,
      allowThreads: true,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544093${sequence++}`;
      })(),
    });

    const binding = await runtime.gatewayService.upsertBinding({
      channel: 'telegram',
      account_id: 'account:telegram',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'verified',
      evidence_refs: ['binding:1'],
    });

    const outcome = await runtime.dispatchTelegramMessage({
      egress_id: '550e8400-e29b-41d4-a716-446655440931',
      recipient_binding_ref: binding.binding_id,
      conversation_id: 'chat:1',
      payload_ref: 'project:message',
      message_class: 'response',
    });

    expect(outcome.outcome).toBe('delivered');
    expect(delivered).toBe(1);
  });
});
