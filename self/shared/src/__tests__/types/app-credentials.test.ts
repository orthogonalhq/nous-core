import { describe, expect, it } from 'vitest';
import {
  CredentialInjectRequestSchema,
  CredentialOAuthFlowResultSchema,
  CredentialStoreRequestSchema,
  CredentialStoreResultSchema,
  CredentialVaultEntrySchema,
} from '../../types/app-credentials.js';

describe('app credential schemas', () => {
  it('accepts a valid credential store request and safe result', () => {
    const request = CredentialStoreRequestSchema.safeParse({
      key: 'weather_api',
      value: 'super-secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });
    const result = CredentialStoreResultSchema.safeParse({
      credential_ref: 'cred:weather_api',
      metadata: {
        app_id: 'app:weather',
        user_key: 'weather_api',
        credential_ref: 'cred:weather_api',
        credential_type: 'bearer_token',
        target_host: 'api.weather.example',
        injection_location: 'header',
        injection_key: 'Authorization',
        created_at: '2026-03-17T00:00:00.000Z',
        updated_at: '2026-03-17T00:00:00.000Z',
      },
    });

    expect(request.success).toBe(true);
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('super-secret-token');
  });

  it('requires url-shaped request descriptors for injection', () => {
    const result = CredentialInjectRequestSchema.safeParse({
      key: 'weather_api',
      request_descriptor: {
        method: 'GET',
        url: 'not-a-url',
      },
    });

    expect(result.success).toBe(false);
  });

  it('treats encrypted vault entries as storage-only records', () => {
    const result = CredentialVaultEntrySchema.safeParse({
      app_id: 'app:weather',
      user_key: 'weather_api',
      credential_ref: 'cred:weather_api',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
      created_at: '2026-03-17T00:00:00.000Z',
      updated_at: '2026-03-17T00:00:00.000Z',
      vault_key: 'app:weather:weather_api',
      encrypted_value: 'ciphertext',
      iv: 'iv',
      auth_tag: 'tag',
    });

    expect(result.success).toBe(true);
    expect(result.data?.encrypted_value).toBe('ciphertext');
  });

  it('accepts metadata-only OAuth flow results', () => {
    const result = CredentialOAuthFlowResultSchema.safeParse({
      status: 'success',
      credentialRef: 'cred:weather_api',
      grantedScopes: ['weather.read'],
      expiresAt: '2026-03-18T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});
