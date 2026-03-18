import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NodeRuntime } from '@nous/autonomic-runtime';
import { AppPackageManifestSchema } from '@nous/shared';
import { loadInstalledAppPackage } from '../package-store/document-loader.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const manifestPath = fileURLToPath(
  new URL('../../../../../.apps/telegram-connector/manifest.json', import.meta.url),
);
const mainPath = fileURLToPath(
  new URL('../../../../../.apps/telegram-connector/main.ts', import.meta.url),
);
const lockfilePath = fileURLToPath(
  new URL('../../../../../.apps/telegram-connector/deno.lock', import.meta.url),
);

describe('telegram reference app package', () => {
  it('loads the installed telegram connector package from the canonical app store', async () => {
    const runtime = new NodeRuntime();
    const loaded = await loadInstalledAppPackage({
      instanceRoot: repoRoot,
      runtime,
      packageId: 'telegram-connector',
    });

    expect(loaded.packageId).toBe('telegram-connector');
    expect(loaded.manifest.id).toBe('telegram');
    expect(loaded.manifest.adapters?.[0]?.name).toBe('telegram');
    expect(loaded.manifest.tools.map((tool: { name: string }) => `telegram.${tool.name}`)).toEqual([
      'telegram.connector_status',
      'telegram.sync_updates',
      'telegram.send_message',
      'telegram.acknowledge_escalation',
    ]);
    expect(loaded.entrypointRef).toBe(mainPath);
    expect(loaded.lockfileRef).toBe(lockfilePath);
  });

  it('declares progressive config with vault-backed secret fields in the manifest', () => {
    const manifest = AppPackageManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath, 'utf-8')),
    );

    expect(manifest.config?.bot_token?.type).toBe('secret');
    expect(manifest.config?.bot_token?.required).toBe(true);
    expect(manifest.config?.client_api_hash?.type).toBe('secret');
    expect(manifest.lifecycle?.onInstall).toBe('./src/hooks/install.ts');
  });

  it('ships the runtime and lifecycle entrypoints referenced by the manifest', () => {
    const mainSource = readFileSync(mainPath, 'utf-8');

    expect(mainSource).toContain('createTelegramConnectorRuntime');
    expect(mainSource).toContain("app: 'telegram-connector'");
    expect(
      readFileSync(
        fileURLToPath(
          new URL('../../../../../.apps/telegram-connector/src/hooks/install.ts', import.meta.url),
        ),
        'utf-8',
      ),
    ).toContain('deriveTelegramConnectorProfile');
  });
});
