import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { appRouter } from '../trpc/root';
import { packagesRouter } from '../trpc/routers/packages';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig } from '../../test-support/project-fixtures';

describe('packages router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-packages-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('prepares the canonical app-install contract and blocks install when required config is missing', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(
      createProjectConfig({
        id: randomUUID() as any,
        name: 'Packages Router Project',
      }),
    );
    const sourceRoot = await mkdtemp(join(tmpdir(), 'nous-router-app-'));
    await mkdir(join(sourceRoot, 'hooks'), { recursive: true });
    await writeFile(
      join(sourceRoot, 'manifest.json'),
      JSON.stringify({
        id: 'telegram',
        name: 'telegram-connector',
        display_name: 'Telegram Connector',
        description: 'Reference connector app',
        version: '1.0.0',
        package_type: 'app',
        origin_class: 'nous_first_party',
        api_contract_range: '^1.0.0',
        capabilities: ['tool.execute'],
        permissions: {
          network: ['api.telegram.org'],
          credentials: true,
          witnessLevel: 'session',
          systemNotify: false,
          memoryContribute: true,
        },
        tools: [
          {
            name: 'connector_status',
            description: 'Connector status',
            inputSchema: {},
            outputSchema: {},
            riskLevel: 'low',
            idempotent: true,
            sideEffects: [],
            memoryRelevance: 'low',
          },
        ],
        config: {
          bot_token: {
            type: 'secret',
            required: true,
            label: 'Bot Token',
            group: 'connector',
          },
        },
      }),
      'utf8',
    );
    await writeFile(join(sourceRoot, 'main.ts'), 'export default {};\n', 'utf8');

    await ctx.registryService.applyGovernanceAction({
      action_type: 'verify_maintainer',
      maintainer_id: 'maintainer:1',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_verification_state: 'verified_individual',
      approval_evidence_ref: 'approval:1',
      evidence_refs: ['approval:1'],
    });

    await ctx.registryService.submitRelease({
      project_id: projectId,
      package_id: 'telegram-connector',
      package_type: 'app',
      display_name: 'Telegram Connector',
      package_version: '1.0.0',
      origin_class: 'nous_first_party',
      registered: true,
      signing_key_id: 'key-1',
      signature_set_ref: 'sigset-1',
      source_hash: 'sha256:telegram',
      compatibility: {
        api_contract_range: '^1.0.0',
        capability_manifest: ['tool.execute'],
        migration_contract_version: '1',
        data_schema_versions: ['1'],
        policy_profile_defaults: [],
      },
      metadata_chain: {
        root_version: 1,
        timestamp_version: 1,
        snapshot_version: 1,
        targets_version: 1,
        trusted_root_key_ids: ['root-a'],
        delegated_key_ids: [],
        metadata_expires_at: '2027-03-18T00:00:00.000Z',
        artifact_digest: 'sha256:telegram',
        metadata_digest: 'sha256:telegram-meta',
      },
      install_source_path: sourceRoot,
      maintainer_ids: ['maintainer:1'],
      published_at: '2026-03-18T00:00:00.000Z',
    });

    const preparation = await caller.packages.prepareAppInstall({
      project_id: projectId,
      package_id: 'telegram-connector',
    });
    const installResult = await caller.packages.installApp({
      project_id: projectId,
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      permissions_approved: true,
      config: {},
      secrets: {},
      evidence_refs: [],
    });

    expect(preparation.config_groups[0]?.fields[0]?.key).toBe('bot_token');
    expect(installResult.status).toBe('failed');
    expect(installResult.phase).toBe('configuration');
    expect(installResult.validation.results[0]?.field).toBe('bot_token');
  });

  it('routes canonical app-settings prepare/save calls and panel listings through the shared context seams', async () => {
    const prepareSettings = vi.fn().mockResolvedValue({
      project_id: '550e8400-e29b-41d4-a716-446655440803',
      package_id: 'telegram-connector',
      release_id: 'release-1',
      package_version: '1.0.0',
      app_id: 'telegram',
      display_name: 'Telegram Connector',
      config_version: 'cfg-1',
      runtime: {
        status: 'active',
        config_version: 'cfg-1',
      },
      config_groups: [],
      panel_config_snapshot: {},
    });
    const saveSettings = vi.fn().mockResolvedValue({
      status: 'success',
      apply_status: 'applied',
      phase: 'completed',
      validation: {
        status: 'success',
        results: [],
      },
      effective_config_version: 'cfg-2',
      runtime: {
        status: 'active',
        config_version: 'cfg-2',
      },
      stored_secrets: [],
      rollback_applied: false,
      recoverable: true,
      metadata: {},
    });
    const listPanels = vi.fn().mockResolvedValue([
      {
        session_id: 'session-1',
        app_id: 'telegram',
        package_id: 'telegram-connector',
        package_version: '1.0.0',
        config_version: 'cfg-2',
        panel_id: 'main',
        label: 'Main',
        entry: 'panels/main.tsx',
        preserve_state: true,
        package_root_ref: '/tmp/.apps/telegram-connector',
        manifest_ref: '/tmp/.apps/telegram-connector/manifest.json',
        route_path: '/apps/telegram/panels/main',
        dockview_panel_id: 'app:telegram:main',
        config_snapshot: {
          units: {
            value: 'metric',
            source: 'project_config',
          },
        },
      },
    ]);

    const caller = packagesRouter.createCaller({
      appSettingsService: {
        prepareSettings,
        saveSettings,
      },
      appRuntimeService: {
        listPanels,
      },
    } as any);

    const preparation = await caller.prepareAppSettings({
      project_id: '550e8400-e29b-41d4-a716-446655440803' as any,
      package_id: 'telegram-connector',
    });
    const result = await caller.saveAppSettings({
      project_id: '550e8400-e29b-41d4-a716-446655440803' as any,
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      expected_config_version: 'cfg-1',
      config: {},
      secrets: {},
      evidence_refs: [],
    });
    const panels = await caller.listAppPanels();

    expect(preparation.config_version).toBe('cfg-1');
    expect(result.effective_config_version).toBe('cfg-2');
    expect(panels[0]?.config_version).toBe('cfg-2');
    expect(prepareSettings).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(listPanels).toHaveBeenCalledTimes(1);
  });
});

