import { describe, expect, it } from 'vitest';
import { CredentialVaultService } from '../credential-vault-service.js';

describe('CredentialVaultService', () => {
  it('stores encrypted credentials and keeps namespaces isolated', async () => {
    const service = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
      now: () => '2026-03-17T00:00:00.000Z',
    });

    const stored = await service.store('app:weather', {
      key: 'weather_api',
      value: 'secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const metadata = await service.getMetadata('app:weather', 'weather_api');
    const resolved = await service.resolveForInjection('app:weather', 'weather_api');
    const missing = await service.getMetadata('app:mail', 'weather_api');

    expect(stored.credential_ref).toContain('app:weather:weather_api');
    expect(metadata?.target_host).toBe('api.weather.example');
    expect(resolved?.secretValue).toBe('secret-token');
    expect(missing).toBeNull();
  });

  it('revokes and purges namespaced credentials', async () => {
    const service = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
    });

    await service.store('app:weather', {
      key: 'weather_api',
      value: 'secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });
    await service.store('app:weather', {
      key: 'weather_backup',
      value: 'secret-token-2',
      credential_type: 'api_key',
      target_host: 'api.weather.example',
      injection_location: 'query',
      injection_key: 'api_key',
    });

    const revoked = await service.revoke('app:weather', {
      key: 'weather_api',
      reason: 'rotate',
    });
    const purged = await service.purgeNamespace('app:weather');

    expect(revoked.revoked).toBe(true);
    expect(purged.purged_count).toBe(1);
    expect(await service.getMetadata('app:weather', 'weather_backup')).toBeNull();
  });

  it('backs up, restores, and discards credential snapshots for secret rotation', async () => {
    const service = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
      now: () => '2026-03-19T00:00:00.000Z',
    });

    await service.store('app:weather', {
      key: 'weather_api',
      value: 'secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const backup = await service.backup('app:weather', 'weather_api');
    await service.store('app:weather', {
      key: 'weather_api',
      value: 'rotated-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const restored = await service.restore('app:weather', backup.backup_ref);
    const resolved = await service.resolveForInjection('app:weather', 'weather_api');
    const discarded = await service.discardBackup('app:weather', backup.backup_ref);

    expect(backup.existed).toBe(true);
    expect(restored.restored).toBe(true);
    expect(resolved?.secretValue).toBe('secret-token');
    expect(discarded.discarded).toBe(true);
  });

  it('restores empty backups by removing credentials created after the snapshot', async () => {
    const service = new CredentialVaultService({
      keyResolverOptions: {
        masterKey: 'test-key',
      },
    });

    const backup = await service.backup('app:weather', 'weather_api');
    await service.store('app:weather', {
      key: 'weather_api',
      value: 'secret-token',
      credential_type: 'bearer_token',
      target_host: 'api.weather.example',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const restored = await service.restore('app:weather', backup.backup_ref);
    const metadata = await service.getMetadata('app:weather', 'weather_api');

    expect(backup.existed).toBe(false);
    expect(restored.restored).toBe(true);
    expect(metadata).toBeNull();
  });
});
