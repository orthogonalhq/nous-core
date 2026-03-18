import {
  deriveTelegramConnectorProfile,
  redactTelegramSecrets,
  type TelegramConnectorConfigInput,
} from '../config.ts';

export const onInstall = (config: TelegramConnectorConfigInput) => {
  const profile = deriveTelegramConnectorProfile(config);
  return {
    status: profile.install_status,
    mode: profile.mode,
    account_id: profile.account_id,
    validation: profile.validation,
    redacted_secrets: redactTelegramSecrets(config),
  };
};
