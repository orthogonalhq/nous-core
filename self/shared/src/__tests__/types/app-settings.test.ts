import { describe, expect, it } from 'vitest';
import {
  AppSettingsPreparationSchema,
  AppSettingsSaveRequestSchema,
  AppSettingsSaveResultSchema,
  AppSettingsSecretMutationSchema,
} from '../../types/app-settings.js';

describe('AppSettingsPreparationSchema', () => {
  it('accepts grouped settings preparation contracts with runtime state', () => {
    const parsed = AppSettingsPreparationSchema.parse({
      project_id: '550e8400-e29b-41d4-a716-446655440901',
      package_id: 'telegram-connector',
      release_id: 'release-1',
      package_version: '1.0.0',
      app_id: 'telegram',
      display_name: 'Telegram Connector',
      description: 'Reference connector app',
      config_version: 'cfg-1',
      runtime: {
        session_id: 'session-1',
        status: 'active',
        health_status: 'healthy',
        config_version: 'cfg-1',
      },
      config_groups: [
        {
          id: 'connector',
          label: 'Connector',
          fields: [
            {
              key: 'bot_token',
              type: 'secret',
              required: true,
              label: 'Bot Token',
              group: 'connector',
              secret: true,
              value_source: 'secret_state',
              secret_state: {
                key: 'bot_token',
                configured: true,
                credential_ref: 'credential:telegram:bot_token',
                source: 'secret_field',
              },
            },
            {
              key: 'region',
              type: 'string',
              required: true,
              label: 'Region',
              group: 'connector',
              secret: false,
              value: 'us',
              value_source: 'project_config',
            },
          ],
        },
      ],
      panel_config_snapshot: {
        region: {
          value: 'us',
          source: 'project_config',
        },
      },
    });

    expect(parsed.runtime.status).toBe('active');
    expect(parsed.config_groups[0]?.fields[0]?.secret_state?.configured).toBe(true);
  });
});

describe('AppSettingsSecretMutationSchema', () => {
  it('requires a value for replace and rejects stray values for retain', () => {
    const replace = AppSettingsSecretMutationSchema.safeParse({
      operation: 'replace',
      value: 'next-secret',
    });
    const invalidRetain = AppSettingsSecretMutationSchema.safeParse({
      operation: 'retain',
      value: 'should-not-be-here',
    });

    expect(replace.success).toBe(true);
    expect(invalidRetain.success).toBe(false);
  });
});

describe('AppSettingsSaveRequestSchema', () => {
  it('defaults optional config, secrets, and evidence collections', () => {
    const parsed = AppSettingsSaveRequestSchema.parse({
      project_id: '550e8400-e29b-41d4-a716-446655440902',
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      expected_config_version: 'cfg-1',
    });

    expect(parsed.config).toEqual({});
    expect(parsed.secrets).toEqual({});
    expect(parsed.evidence_refs).toEqual([]);
  });
});

describe('AppSettingsSaveResultSchema', () => {
  it('accepts recoverable partial save outcomes with rollback evidence', () => {
    const parsed = AppSettingsSaveResultSchema.parse({
      status: 'partial',
      apply_status: 'reverted',
      phase: 'recovery',
      validation: {
        status: 'success',
        results: [],
      },
      requested_config_version: 'cfg-2',
      effective_config_version: 'cfg-1',
      runtime: {
        status: 'active',
        session_id: 'session-1',
        config_version: 'cfg-1',
      },
      stored_secrets: [
        {
          key: 'bot_token',
          configured: true,
          credential_ref: 'credential:telegram:bot_token',
          source: 'secret_field',
        },
      ],
      activation_failure: {
        code: 'APP-SETTINGS-ACTIVATION-FAILED',
        message: 'Activation failed.',
        retryable: true,
      },
      rollback_applied: true,
      recoverable: true,
      metadata: {
        restored_config_version: 'cfg-1',
      },
    });

    expect(parsed.apply_status).toBe('reverted');
    expect(parsed.rollback_applied).toBe(true);
  });
});
