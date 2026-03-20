import { describe, expect, it } from 'vitest';
import {
  deriveTelegramConnectorProfile,
  redactTelegramSecrets,
} from '../config.ts';
import {
  buildTelegramConnectorId,
  buildTelegramConnectorStatus,
  buildTelegramSendMessageIntent,
  buildTelegramSessionReport,
  buildTelegramSyncUpdatesIntent,
  createTelegramConnectorRuntime,
} from '../runtime.ts';
import { onInstall } from '../hooks/install.ts';

describe('telegram connector runtime', () => {
  it('derives connector, full-client, and partial progressive-config outcomes', () => {
    const connector = deriveTelegramConnectorProfile({
      bot_token: 'secret-bot-token',
    });
    const fullClient = deriveTelegramConnectorProfile({
      bot_token: 'secret-bot-token',
      client_api_id: '1001',
      client_api_hash: 'secret-client-hash',
      client_phone_number: '+15555550123',
      default_account_id: 'account:telegram',
    });
    const partial = onInstall({
      bot_token: 'secret-bot-token',
      client_api_id: '1001',
    });

    expect(connector.mode).toBe('connector');
    expect(connector.install_status).toBe('success');
    expect(fullClient.mode).toBe('full_client');
    expect(fullClient.install_status).toBe('success');
    expect(partial.status).toBe('partial');
    expect(redactTelegramSecrets({
      bot_token: 'secret-bot-token',
      client_api_hash: 'secret-client-hash',
    })).toEqual({
      bot_token: '[redacted]',
      client_api_hash: '[redacted]',
    });
  });

  it('builds host-owned connector ids, session reports, ingress intents, and egress intents', () => {
    const connectorId = buildTelegramConnectorId('account:telegram');
    const report = buildTelegramSessionReport({
      session_id: 'session-1',
      reported_at: '2026-03-17T00:00:00.000Z',
      health: 'healthy',
      config: {
        bot_token: 'secret-bot-token',
        default_account_id: 'account:telegram',
      },
    });
    const status = buildTelegramConnectorStatus({
      session_id: 'session-1',
      reported_at: '2026-03-17T00:00:00.000Z',
      health: 'healthy',
      config: {
        bot_token: 'secret-bot-token',
        default_account_id: 'account:telegram',
      },
    });
    const ingress = buildTelegramSyncUpdatesIntent({
      session_id: 'session-1',
      connector_id: connectorId,
      envelope: {
        ingress_id: '550e8400-e29b-41d4-a716-446655440401',
      },
    });
    const egress = buildTelegramSendMessageIntent({
      session_id: 'session-1',
      connector_id: connectorId,
      envelope: {
        egress_id: '550e8400-e29b-41d4-a716-446655440402',
      },
    });

    expect(connectorId).toBe('connector:telegram:account:telegram');
    expect(report.mode).toBe('connector');
    expect(report.connector_id).toBe(connectorId);
    expect(status.connector_id).toBe(connectorId);
    expect(ingress.source).toBe('telegram_poller');
    expect(egress.requested_by_tool).toBe('telegram.send_message');
  });

  it('exposes the canonical Telegram tool list for the reference app', () => {
    const runtime = createTelegramConnectorRuntime();

    expect(runtime.tools).toEqual([
      'telegram.connector_status',
      'telegram.sync_updates',
      'telegram.send_message',
      'telegram.acknowledge_escalation',
    ]);
  });
});
