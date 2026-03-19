import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppRuntimeActivationInput,
  AppRuntimeSession,
  CredentialRevokeRequest,
  CredentialStoreRequest,
  DocumentFilter,
  IDocumentStore,
  IRuntime,
  PlatformInfo,
  ProjectId,
} from '@nous/shared';
import { AppSettingsService } from '../app-settings/service.js';
import { DocumentAppConfigStore } from '../app-install/config-store.js';

class TestRuntime implements IRuntime {
  resolvePath(...segments: string[]): string {
    return join(...segments);
  }

  getDataDir(): string {
    return tmpdir();
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  async copyDirectory(from: string, to: string): Promise<void> {
    await cp(from, to, { recursive: true, force: true });
  }

  async removePath(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  async listDirectory(_path: string): Promise<string[]> {
    return [];
  }

  getPlatform(): PlatformInfo {
    return {
      os: 'linux',
      arch: 'x64',
      nodeVersion: process.version,
    };
  }
}

class InMemoryDocumentStore implements IDocumentStore {
  private readonly collections = new Map<string, Map<string, unknown>>();

  async put<T>(collection: string, id: string, document: T): Promise<void> {
    if (!this.collections.has(collection)) {
      this.collections.set(collection, new Map());
    }
    this.collections.get(collection)!.set(id, document);
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    return (this.collections.get(collection)?.get(id) as T | undefined) ?? null;
  }

  async query<T>(collection: string, filter: DocumentFilter): Promise<T[]> {
    const values = [...(this.collections.get(collection)?.values() ?? [])] as T[];
    if (!filter.where) {
      return values;
    }

    return values.filter((candidate) => {
      const record = candidate as Record<string, unknown>;
      return Object.entries(filter.where ?? {}).every(([key, value]) => record[key] === value);
    });
  }

  async delete(collection: string, id: string): Promise<boolean> {
    return this.collections.get(collection)?.delete(id) ?? false;
  }
}

const NOW = '2026-03-19T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440910' as ProjectId;

function createSession(input: {
  sessionId?: string;
  status?: AppRuntimeSession['status'];
  configVersion: string;
}): AppRuntimeSession {
  return {
    session_id: input.sessionId ?? 'session-1',
    app_id: 'telegram',
    package_id: 'telegram-connector',
    package_version: '1.0.0',
    project_id: PROJECT_ID,
    pid: 4321,
    status: input.status ?? 'active',
    started_at: NOW,
    registered_tool_ids: [],
    panel_ids: [],
    health_status: 'healthy',
    config_version: input.configVersion,
  };
}

function writeInstalledApp(instanceRoot: string) {
  mkdirSync(join(instanceRoot, '.apps', 'telegram-connector'), { recursive: true });
  mkdirSync(join(instanceRoot, '.skills'), { recursive: true });
  mkdirSync(join(instanceRoot, '.workflows'), { recursive: true });
  mkdirSync(join(instanceRoot, '.projects'), { recursive: true });
  mkdirSync(join(instanceRoot, '.contracts'), { recursive: true });

  writeFileSync(
    join(instanceRoot, '.apps', 'telegram-connector', 'manifest.json'),
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
        region: {
          type: 'string',
          required: true,
          label: 'Region',
          group: 'connector',
        },
        units: {
          type: 'select',
          required: false,
          label: 'Units',
          group: 'display',
          default: 'metric',
          options: ['metric', 'imperial'],
        },
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
  writeFileSync(join(instanceRoot, '.apps', 'telegram-connector', 'main.ts'), 'export default {};\n', 'utf8');
  writeFileSync(
    join(instanceRoot, '.apps', 'telegram-connector', '.nous-package.json'),
    JSON.stringify({
      package_version: '1.0.0',
    }),
    'utf8',
  );
}

function createDependencies() {
  const runtime = new TestRuntime();
  const documentStore = new InMemoryDocumentStore();
  const configStore = new DocumentAppConfigStore(documentStore);
  const installHookRunner = {
    runOnInstall: vi.fn().mockResolvedValue({
      status: 'success',
      results: [],
      metadata: {},
    }),
  };
  const appRuntimeService = {
    listSessions: vi.fn().mockResolvedValue([createSession({ configVersion: 'cfg-1' })]),
    deactivate: vi.fn().mockResolvedValue(
      createSession({
        sessionId: 'session-1',
        status: 'stopped',
        configVersion: 'cfg-1',
      }),
    ),
    activate: vi.fn().mockImplementation(async (input: AppRuntimeActivationInput) =>
      createSession({
        sessionId: 'session-2',
        status: 'active',
        configVersion: input.launch_spec.config_version,
      })),
  };
  const appCredentialInstallService = {
    storeSecretField: vi.fn().mockImplementation(async (appId: string, request: CredentialStoreRequest) => ({
      credential_ref: `credential:${appId}:${request.key}:updated`,
      metadata: {
        app_id: appId,
        user_key: request.key,
        credential_ref: `credential:${appId}:${request.key}:updated`,
        credential_type: request.credential_type,
        target_host: request.target_host,
        injection_location: request.injection_location,
        injection_key: request.injection_key,
        created_at: NOW,
        updated_at: NOW,
      },
    })),
    revokeCredential: vi.fn().mockImplementation(async (appId: string, request: CredentialRevokeRequest) => ({
      revoked: true,
      credential_ref: `credential:${appId}:${request.key}:updated`,
      reason: request.reason,
    })),
    backupCredential: vi.fn().mockImplementation(async (_appId: string, key: string) => ({
      backup_ref: `backup:${key}`,
      existed: true,
    })),
    restoreCredential: vi.fn().mockResolvedValue({
      restored: true,
    }),
    discardCredentialBackup: vi.fn().mockResolvedValue({
      discarded: true,
    }),
    openOAuthFlow: vi.fn(),
  };

  return {
    runtime,
    configStore,
    installHookRunner,
    appRuntimeService,
    appCredentialInstallService,
  };
}

function createService(input: ReturnType<typeof createDependencies>, instanceRoot: string) {
  return new AppSettingsService({
    appCredentialInstallService: input.appCredentialInstallService as any,
    appRuntimeService: input.appRuntimeService as any,
    configStore: input.configStore,
    installHookRunner: input.installHookRunner as any,
    runtime: input.runtime,
    instanceRoot,
    now: () => NOW,
    idFactory: () => 'cfg-2',
  });
}

describe('AppSettingsService', () => {
  const createdRoots: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('prepares canonical grouped settings with runtime and safe panel snapshot state', async () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), 'nous-app-settings-service-'));
    createdRoots.push(instanceRoot);
    writeInstalledApp(instanceRoot);

    const deps = createDependencies();
    const service = createService(deps, instanceRoot);
    await deps.configStore.put({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      release_id: 'release-1',
      app_id: 'telegram',
      config_version: 'cfg-1',
      values: {
        region: 'us',
      },
      secret_config: {
        bot_token: {
          key: 'bot_token',
          configured: true,
          credential_ref: 'credential:telegram:bot_token',
          source: 'secret_field',
        },
      },
      updated_at: NOW,
    });

    const preparation = await service.prepareSettings({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
    });

    const connectorGroup = preparation.config_groups.find((group) => group.id === 'connector');
    const displayGroup = preparation.config_groups.find((group) => group.id === 'display');

    expect(preparation.runtime.status).toBe('active');
    expect(connectorGroup?.fields.find((field) => field.key === 'region')?.value).toBe('us');
    expect(connectorGroup?.fields.find((field) => field.key === 'bot_token')?.secret_state?.configured).toBe(true);
    expect(displayGroup?.fields.find((field) => field.key === 'units')?.value).toBe('metric');
    expect(preparation.panel_config_snapshot).toEqual({
      region: {
        value: 'us',
        source: 'project_config',
      },
      units: {
        value: 'metric',
        source: 'manifest_default',
      },
    });
  });

  it('applies governed settings saves with optimistic config updates and secret rotation', async () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), 'nous-app-settings-service-'));
    createdRoots.push(instanceRoot);
    writeInstalledApp(instanceRoot);

    const deps = createDependencies();
    const service = createService(deps, instanceRoot);
    await deps.configStore.put({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      release_id: 'release-1',
      app_id: 'telegram',
      config_version: 'cfg-1',
      values: {
        region: 'us',
      },
      secret_config: {
        bot_token: {
          key: 'bot_token',
          configured: true,
          credential_ref: 'credential:telegram:bot_token',
          source: 'secret_field',
        },
      },
      updated_at: NOW,
    });

    const result = await service.saveSettings({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      expected_config_version: 'cfg-1',
      config: {
        region: 'eu',
        units: 'imperial',
      },
      secrets: {
        bot_token: {
          operation: 'replace',
          value: 'next-secret',
        },
      },
      evidence_refs: ['witness:settings-save'],
    });

    const updated = await deps.configStore.get(PROJECT_ID, 'telegram-connector');

    expect(result.status).toBe('success');
    expect(result.apply_status).toBe('applied');
    expect(result.effective_config_version).toBe('cfg-2');
    expect(updated?.config_version).toBe('cfg-2');
    expect(updated?.values).toEqual({
      region: 'eu',
      units: 'imperial',
    });
    expect(updated?.secret_config.bot_token?.credential_ref).toBe(
      'credential:telegram:bot_token:updated',
    );
    expect(deps.appRuntimeService.deactivate.mock.invocationCallOrder[0]).toBeLessThan(
      deps.appRuntimeService.activate.mock.invocationCallOrder[0],
    );
    expect(deps.installHookRunner.runOnInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          config: expect.objectContaining({
            region: 'eu',
            units: 'imperial',
            bot_token: '[vault:configured]',
          }),
        }),
      }),
    );
    expect(deps.appCredentialInstallService.backupCredential).toHaveBeenCalledWith(
      'telegram',
      'bot_token',
    );
    expect(deps.appCredentialInstallService.storeSecretField).toHaveBeenCalled();
    expect(deps.appCredentialInstallService.discardCredentialBackup).toHaveBeenCalledWith(
      'telegram',
      'backup:bot_token',
    );
  });

  it('blocks stale settings saves before mutation work begins', async () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), 'nous-app-settings-service-'));
    createdRoots.push(instanceRoot);
    writeInstalledApp(instanceRoot);

    const deps = createDependencies();
    const service = createService(deps, instanceRoot);
    await deps.configStore.put({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      release_id: 'release-1',
      app_id: 'telegram',
      config_version: 'cfg-1',
      values: {
        region: 'us',
      },
      secret_config: {
        bot_token: {
          key: 'bot_token',
          configured: true,
          credential_ref: 'credential:telegram:bot_token',
          source: 'secret_field',
        },
      },
      updated_at: NOW,
    });

    const result = await service.saveSettings({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      expected_config_version: 'cfg-stale',
      config: {
        region: 'eu',
      },
      secrets: {},
      evidence_refs: [],
    });

    expect(result.status).toBe('failed');
    expect(result.apply_status).toBe('blocked');
    expect(result.phase).toBe('validation');
    expect(result.metadata.current_config_version).toBe('cfg-1');
    expect(deps.appRuntimeService.deactivate).not.toHaveBeenCalled();
    expect(deps.appCredentialInstallService.backupCredential).not.toHaveBeenCalled();
  });

  it('restores the previous config and secret state when activation fails after mutation', async () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), 'nous-app-settings-service-'));
    createdRoots.push(instanceRoot);
    writeInstalledApp(instanceRoot);

    const deps = createDependencies();
    deps.appRuntimeService.activate = vi
      .fn()
      .mockRejectedValueOnce(new Error('activation failed'))
      .mockResolvedValueOnce(
        createSession({
          sessionId: 'session-restored',
          status: 'active',
          configVersion: 'cfg-1',
        }),
      );
    const service = createService(deps, instanceRoot);
    await deps.configStore.put({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      release_id: 'release-1',
      app_id: 'telegram',
      config_version: 'cfg-1',
      values: {
        region: 'us',
      },
      secret_config: {
        bot_token: {
          key: 'bot_token',
          configured: true,
          credential_ref: 'credential:telegram:bot_token',
          source: 'secret_field',
        },
      },
      updated_at: NOW,
    });

    const result = await service.saveSettings({
      project_id: PROJECT_ID,
      package_id: 'telegram-connector',
      actor_id: 'web-test',
      expected_config_version: 'cfg-1',
      config: {
        region: 'eu',
      },
      secrets: {
        bot_token: {
          operation: 'replace',
          value: 'next-secret',
        },
      },
      evidence_refs: [],
    });

    const restored = await deps.configStore.get(PROJECT_ID, 'telegram-connector');

    expect(result.status).toBe('partial');
    expect(result.apply_status).toBe('reverted');
    expect(result.phase).toBe('recovery');
    expect(result.effective_config_version).toBe('cfg-1');
    expect(result.activation_failure?.code).toBe('APP-SETTINGS-ACTIVATION-FAILED');
    expect(restored?.config_version).toBe('cfg-1');
    expect(restored?.values).toEqual({
      region: 'us',
    });
    expect(deps.appCredentialInstallService.restoreCredential).toHaveBeenCalledWith(
      'telegram',
      'backup:bot_token',
    );
    expect(deps.appCredentialInstallService.discardCredentialBackup).toHaveBeenCalledWith(
      'telegram',
      'backup:bot_token',
    );
    expect(deps.appRuntimeService.activate).toHaveBeenCalledTimes(2);
  });
});
