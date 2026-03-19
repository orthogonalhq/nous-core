import { describe, expect, it } from 'vitest';
import {
  AppInstallHookResultSchema,
  AppInstallPreparationSchema,
  AppInstallRequestSchema,
  AppInstallResultSchema,
} from '../../types/app-install.js';

describe('AppInstallPreparationSchema', () => {
  it('accepts grouped manifest-derived install preparation contracts', () => {
    const result = AppInstallPreparationSchema.safeParse({
      package_id: 'telegram-connector',
      release_id: 'release-1',
      package_version: '1.0.0',
      app_id: 'telegram',
      display_name: 'Telegram Connector',
      description: 'Reference connector app',
      permissions: {
        network: ['api.telegram.org'],
        credentials: true,
        witnessLevel: 'session',
        systemNotify: false,
        memoryContribute: true,
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
              description: 'Vault-backed bot credential.',
              group: 'connector',
              secret: true,
            },
          ],
        },
      ],
      has_install_hook: true,
    });

    expect(result.success).toBe(true);
  });
});

describe('AppInstallRequestSchema', () => {
  it('defaults optional config, secret, oauth, and evidence collections', () => {
    const parsed = AppInstallRequestSchema.parse({
      project_id: '550e8400-e29b-41d4-a716-446655440900',
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      permissions_approved: true,
    });

    expect(parsed.config).toEqual({});
    expect(parsed.secrets).toEqual({});
    expect(parsed.oauth).toEqual([]);
    expect(parsed.evidence_refs).toEqual([]);
  });
});

describe('AppInstallHookResultSchema', () => {
  it('accepts normalized install-hook validation payloads', () => {
    const parsed = AppInstallHookResultSchema.parse({
      status: 'partial',
      results: [
        {
          check: 'full-client-credentials-complete',
          passed: false,
          retryable: true,
          message: 'Connector mode remains active while full-client setup is incomplete.',
        },
      ],
      metadata: {
        mode: 'connector',
      },
    });

    expect(parsed.status).toBe('partial');
    expect(parsed.metadata.mode).toBe('connector');
  });
});

describe('AppInstallResultSchema', () => {
  it('accepts recoverable partial install outcomes with witness linkage', () => {
    const parsed = AppInstallResultSchema.parse({
      status: 'partial',
      phase: 'completed',
      preparation: {
        package_id: 'telegram-connector',
        release_id: 'release-1',
        package_version: '1.0.0',
        app_id: 'telegram',
        display_name: 'Telegram Connector',
        permissions: {
          network: ['api.telegram.org'],
          credentials: true,
          witnessLevel: 'session',
          systemNotify: false,
          memoryContribute: true,
        },
        config_groups: [],
        has_install_hook: true,
      },
      validation: {
        status: 'partial',
        results: [
          {
            check: 'full-client-credentials-complete',
            passed: false,
            retryable: true,
          },
        ],
      },
      runtime_session_id: 'session-1',
      app_config_version: 'cfg-1',
      stored_secrets: [
        {
          key: 'bot_token',
          configured: true,
          credential_ref: 'credential:telegram:bot_token',
          source: 'secret_field',
        },
      ],
      witness_refs: ['evt-auth', 'evt-complete'],
      rollback_applied: false,
      recoverable: true,
      metadata: {
        mode: 'connector',
      },
    });

    expect(parsed.status).toBe('partial');
    expect(parsed.witness_refs).toHaveLength(2);
  });
});

