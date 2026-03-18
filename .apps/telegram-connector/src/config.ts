export type TelegramConnectorMode = 'connector' | 'full_client';
export type TelegramInstallStatus = 'success' | 'partial' | 'failed';

export interface TelegramConnectorConfigInput {
  bot_token?: string | null;
  bot_username?: string | null;
  default_account_id?: string | null;
  client_api_id?: string | null;
  client_api_hash?: string | null;
  client_phone_number?: string | null;
}

export interface TelegramValidationEntry {
  field?: keyof TelegramConnectorConfigInput;
  check: string;
  passed: boolean;
  message?: string;
  retryable?: boolean;
}

export interface TelegramConnectorProfile {
  mode: TelegramConnectorMode;
  install_status: TelegramInstallStatus;
  account_id: string;
  capabilities: {
    ingress: true;
    egress: true;
    acknowledgement: true;
    full_client: boolean;
  };
  validation: TelegramValidationEntry[];
}

const hasValue = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const redact = (value: string | null | undefined): string | null =>
  hasValue(value) ? '[redacted]' : null;

export const resolveTelegramAccountId = (
  input: TelegramConnectorConfigInput,
): string => input.default_account_id?.trim() || 'account:telegram';

export const redactTelegramSecrets = (
  input: TelegramConnectorConfigInput,
): Record<string, string | null> => ({
  bot_token: redact(input.bot_token),
  client_api_hash: redact(input.client_api_hash),
});

export const deriveTelegramConnectorProfile = (
  input: TelegramConnectorConfigInput,
): TelegramConnectorProfile => {
  const validation: TelegramValidationEntry[] = [];

  if (!hasValue(input.bot_token)) {
    validation.push({
      field: 'bot_token',
      check: 'bot-token-present',
      passed: false,
      message: 'A Telegram bot token is required for connector mode.',
    });
    return {
      mode: 'connector',
      install_status: 'failed',
      account_id: resolveTelegramAccountId(input),
      capabilities: {
        ingress: true,
        egress: true,
        acknowledgement: true,
        full_client: false,
      },
      validation,
    };
  }

  validation.push({
    field: 'bot_token',
    check: 'bot-token-present',
    passed: true,
  });

  const clientFields = [
    'client_api_id',
    'client_api_hash',
    'client_phone_number',
  ] as const;
  const presentCount = clientFields.filter((field) => hasValue(input[field])).length;

  if (presentCount === 0) {
    validation.push({
      check: 'full-client-credentials-optional',
      passed: true,
      message: 'Connector mode remains valid without full-client credentials.',
    });
    return {
      mode: 'connector',
      install_status: 'success',
      account_id: resolveTelegramAccountId(input),
      capabilities: {
        ingress: true,
        egress: true,
        acknowledgement: true,
        full_client: false,
      },
      validation,
    };
  }

  if (presentCount !== clientFields.length) {
    validation.push({
      check: 'full-client-credentials-complete',
      passed: false,
      retryable: true,
      message:
        'Optional full-client credentials must be provided as a complete set; falling back to connector mode.',
    });
    return {
      mode: 'connector',
      install_status: 'partial',
      account_id: resolveTelegramAccountId(input),
      capabilities: {
        ingress: true,
        egress: true,
        acknowledgement: true,
        full_client: false,
      },
      validation,
    };
  }

  validation.push({
    check: 'full-client-credentials-complete',
    passed: true,
  });
  return {
    mode: 'full_client',
    install_status: 'success',
    account_id: resolveTelegramAccountId(input),
    capabilities: {
      ingress: true,
      egress: true,
      acknowledgement: true,
      full_client: true,
    },
    validation,
  };
};
