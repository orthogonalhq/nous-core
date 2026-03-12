import { describe, expect, it } from 'vitest';
import { TelegramBotAdapter } from '../connectors/telegram-bot-adapter.js';

const NOW = '2026-03-11T00:00:00.000Z';

describe('TelegramBotAdapter', () => {
  it('normalizes Telegram updates into canonical ingress envelopes', () => {
    const adapter = new TelegramBotAdapter({
      accountId: 'account:telegram',
      botUsername: 'nous_bot',
      now: () => NOW,
      idFactory: () => '550e8400-e29b-41d4-a716-446655440901',
      payloadRefResolver: () => 'project:message',
    });

    const envelope = adapter.normalizeIngress({
      update_id: 'update:1',
      message: {
        message_id: 'message:1',
        date: 1773187200,
        text: '@nous_bot hello',
        from: {
          id: 'user:1',
          username: 'principal',
        },
        chat: {
          id: 'chat:1',
          type: 'group',
        },
      },
    });

    expect(envelope.sender_channel_identity).toBe('@principal');
    expect(envelope.mention_state).toBe('explicit');
    expect(envelope.message_type).toBe('group');
    expect(envelope.payload_ref).toBe('project:message');
  });

  it('maps transport outcomes into gateway delivery provider outcomes', async () => {
    const adapter = new TelegramBotAdapter({
      accountId: 'account:telegram',
      now: () => NOW,
      transport: {
        async sendMessage() {
          return {
            outcome: 'retryable_failure',
            reason: 'permanent_delivery_failure',
          } as const;
        },
      },
    });

    const result = await adapter.send({
      egress_id: '550e8400-e29b-41d4-a716-446655440902',
      channel: 'telegram',
      channel_id: 'telegram:bot',
      workspace_id: null,
      account_id: 'account:telegram',
      conversation_id: 'chat:1',
      thread_id: null,
      recipient_binding_ref: 'binding:1',
      message_class: 'response',
      payload_ref: 'hello',
      delivery_policy_ref: 'delivery:default',
      retry_policy_ref: 'retry:1',
      requested_at: NOW,
      trace_parent: null,
    });

    expect(result.outcome).toBe('failed');
    expect(result.retryable).toBe(true);
  });
});
