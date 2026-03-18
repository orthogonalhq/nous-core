import { describe, expect, it } from 'vitest';
import { AppCredentialInstallService } from '../app-credential-install-service.js';
import { CredentialOAuthBroker } from '../credential-oauth-broker.js';
import { CredentialVaultService } from '../credential-vault-service.js';

describe('CredentialOAuthBroker', () => {
  it('stores successful OAuth results directly into the vault and returns metadata only', async () => {
    const vaultService = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
      now: () => '2026-03-17T00:00:00.000Z',
    });
    const broker = new CredentialOAuthBroker({
      vaultService,
      exchange: async () => ({
        status: 'success',
        token: 'oauth-secret-token',
        grantedScopes: ['weather.read'],
        expiresAt: '2026-03-18T00:00:00.000Z',
      }),
    });
    const installService = new AppCredentialInstallService({
      vaultService,
      oauthBroker: broker,
    });

    const result = await installService.openOAuthFlow({
      app_id: 'app:weather',
      key: 'weather_oauth',
      provider: 'weather',
      scopes: ['weather.read'],
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
      metadata: {},
    });

    const resolved = await vaultService.resolveForInjection('app:weather', 'weather_oauth');

    expect(result.status).toBe('success');
    expect(result.credentialRef).toBeDefined();
    expect(JSON.stringify(result)).not.toContain('oauth-secret-token');
    expect(resolved?.secretValue).toBe('oauth-secret-token');
  });

  it('returns cancellation metadata without storing a credential', async () => {
    const vaultService = new CredentialVaultService();
    const broker = new CredentialOAuthBroker({
      vaultService,
      exchange: async () => ({
        status: 'cancelled',
        reason: 'user_cancelled',
      }),
    });

    const result = await broker.openOAuthFlow({
      app_id: 'app:weather',
      key: 'weather_oauth',
      provider: 'weather',
      scopes: ['weather.read'],
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
      metadata: {},
    });

    expect(result.status).toBe('cancelled');
    expect(result.reason).toBe('user_cancelled');
    expect(await vaultService.getMetadata('app:weather', 'weather_oauth')).toBeNull();
  });
});
