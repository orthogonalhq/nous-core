import { describe, expect, it, vi } from 'vitest';
import { CredentialInjector } from '../credential-injector.js';
import { CredentialVaultService } from '../credential-vault-service.js';

describe('CredentialInjector', () => {
  it('injects credentials into outbound headers only after dual host validation', async () => {
    const vaultService = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
      now: () => '2026-03-17T00:00:00.000Z',
    });
    await vaultService.store('app:weather', {
      key: 'weather_api',
      value: 'secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    const injector = new CredentialInjector({
      vaultService,
      fetchImpl: fetchImpl as any,
      now: () => '2026-03-17T00:00:01.000Z',
    });

    const result = await injector.executeInjectedRequest({
      appId: 'app:weather',
      request: {
        key: 'weather_api',
        request_descriptor: {
          method: 'GET',
          url: 'https://api.weather.example/forecast',
          headers: {},
        },
      },
      manifestNetworkPermissions: ['api.weather.example'],
    });

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      }),
    );
  });

  it('fails closed when the request host is outside policy', async () => {
    const vaultService = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
    });
    await vaultService.store('app:weather', {
      key: 'weather_api',
      value: 'secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const injector = new CredentialInjector({
      vaultService,
      fetchImpl: vi.fn() as any,
    });

    await expect(
      injector.executeInjectedRequest({
        appId: 'app:weather',
        request: {
          key: 'weather_api',
          request_descriptor: {
            method: 'GET',
            url: 'https://api.evil.example/forecast',
            headers: {},
          },
        },
        manifestNetworkPermissions: ['api.weather.example'],
      }),
    ).rejects.toThrow('PKG-010-CREDENTIAL_TARGET_HOST_BLOCKED');
  });
});
