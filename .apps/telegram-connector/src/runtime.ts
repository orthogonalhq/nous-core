import {
  deriveTelegramConnectorProfile,
  type TelegramConnectorConfigInput,
  type TelegramConnectorMode,
} from './config.ts';

export interface TelegramConnectorHealthInput {
  session_id: string;
  reported_at: string;
  health: 'healthy' | 'degraded' | 'unhealthy' | 'stale';
  metadata?: Record<string, unknown>;
}

export interface TelegramSyncUpdatesInput {
  session_id: string;
  connector_id: string;
  envelope: Record<string, unknown>;
  source?: 'telegram_app_tool' | 'telegram_poller';
}

export interface TelegramSendMessageInput {
  session_id: string;
  connector_id: string;
  envelope: Record<string, unknown>;
  requested_by_tool?: string;
}

export interface TelegramConnectorStatusInput {
  session_id: string;
  reported_at: string;
  health: TelegramConnectorHealthInput['health'];
  config: TelegramConnectorConfigInput;
  metadata?: Record<string, unknown>;
}

export const TELEGRAM_CONNECTOR_TOOLS = [
  'telegram.connector_status',
  'telegram.sync_updates',
  'telegram.send_message',
  'telegram.acknowledge_escalation',
] as const;

export const buildTelegramConnectorId = (accountId: string): string =>
  `connector:telegram:${accountId}`;

export const buildTelegramSessionReport = (input: {
  session_id: string;
  reported_at: string;
  health: TelegramConnectorHealthInput['health'];
  config: TelegramConnectorConfigInput;
  metadata?: Record<string, unknown>;
}) => {
  const profile = deriveTelegramConnectorProfile(input.config);
  return {
    session_id: input.session_id,
    connector_id: buildTelegramConnectorId(profile.account_id),
    mode: profile.mode as TelegramConnectorMode,
    health: input.health,
    metadata: {
      account_id: profile.account_id,
      ...input.metadata,
    },
    reported_at: input.reported_at,
  };
};

export const buildTelegramSyncUpdatesIntent = (input: TelegramSyncUpdatesInput) => ({
  session_id: input.session_id,
  connector_id: input.connector_id,
  envelope: input.envelope,
  source: input.source ?? 'telegram_poller',
});

export const buildTelegramSendMessageIntent = (input: TelegramSendMessageInput) => ({
  session_id: input.session_id,
  connector_id: input.connector_id,
  envelope: input.envelope,
  requested_by_tool: input.requested_by_tool ?? 'telegram.send_message',
});

export const buildTelegramConnectorStatus = (input: TelegramConnectorStatusInput) => {
  const report = buildTelegramSessionReport({
    session_id: input.session_id,
    reported_at: input.reported_at,
    health: input.health,
    config: input.config,
    metadata: input.metadata,
  });
  const profile = deriveTelegramConnectorProfile(input.config);
  return {
    connector_id: report.connector_id,
    session_id: input.session_id,
    mode: profile.mode,
    install_status: profile.install_status,
    health_status: input.health,
    capabilities: profile.capabilities,
    metadata: report.metadata,
  };
};

export const createTelegramConnectorRuntime = () => ({
  capabilities: ['connector', 'gateway', 'vault'],
  tools: [...TELEGRAM_CONNECTOR_TOOLS],
});
