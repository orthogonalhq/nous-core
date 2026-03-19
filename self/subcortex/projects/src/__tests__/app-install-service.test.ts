import { mkdtempSync, writeFileSync } from 'node:fs';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentFilter,
  IDocumentStore,
  IRegistryService,
  IRuntime,
  PlatformInfo,
  RegistryInstallEligibilitySnapshot,
  RegistryPackage,
  RegistryRelease,
} from '@nous/shared';
import { PackageLifecycleOrchestrator } from '../package-lifecycle/orchestrator.js';
import { PackageInstallService } from '../package-install/service.js';
import { AppInstallService } from '../app-install/service.js';
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

class FakeRegistryService implements IRegistryService {
  constructor(
    private readonly packages: Map<string, RegistryPackage>,
    private readonly releases: Map<string, RegistryRelease>,
  ) {}

  async submitRelease(): Promise<any> {
    throw new Error('Not implemented in fake');
  }

  async getPackage(packageId: string): Promise<RegistryPackage | null> {
    return this.packages.get(packageId) ?? null;
  }

  async getRelease(releaseId: string): Promise<RegistryRelease | null> {
    return this.releases.get(releaseId) ?? null;
  }

  async listReleases(packageId: string): Promise<RegistryRelease[]> {
    return [...this.releases.values()].filter((release) => release.package_id === packageId);
  }

  async validateMetadataChain(): Promise<any> {
    throw new Error('Not implemented in fake');
  }

  async evaluateInstallEligibility(input: {
    project_id?: string;
    package_id: string;
    release_id: string;
    principal_override_requested: boolean;
    principal_override_approved: boolean;
    evaluated_at?: string;
  }): Promise<RegistryInstallEligibilitySnapshot> {
    const release = this.releases.get(input.release_id)!;
    return {
      project_id: input.project_id as any,
      package_id: input.package_id,
      release_id: input.release_id,
      package_version: release.package_version,
      trust_tier: 'verified_maintainer',
      distribution_status: 'active',
      compatibility_state: 'compatible',
      metadata_valid: true,
      signer_valid: true,
      requires_principal_override: false,
      block_reason_codes: [],
      evidence_refs: ['witness:registry'],
      evaluated_at: input.evaluated_at ?? new Date().toISOString(),
    };
  }

  async applyGovernanceAction(): Promise<any> {
    throw new Error('Not implemented in fake');
  }

  async getMaintainer(): Promise<any> {
    return null;
  }

  async listPackages(): Promise<any> {
    throw new Error('Not implemented in fake');
  }

  async getPackageMaintainers(): Promise<any[]> {
    return [];
  }

  async listGovernanceActions(): Promise<any> {
    return { actions: [], generatedAt: new Date().toISOString() };
  }

  async listAppeals(): Promise<any> {
    return { appeals: [], generatedAt: new Date().toISOString() };
  }

  async submitAppeal(): Promise<any> {
    throw new Error('Not implemented in fake');
  }

  async resolveAppeal(): Promise<any> {
    throw new Error('Not implemented in fake');
  }
}

const NOW = '2026-03-18T00:00:00.000Z';

const createPackage = (packageId: string): RegistryPackage => ({
  package_id: packageId,
  package_type: 'app',
  display_name: 'Telegram Connector',
  latest_release_id: undefined,
  trust_tier: 'verified_maintainer',
  distribution_status: 'active',
  compatibility_state: 'compatible',
  maintainer_ids: ['maintainer:1'],
  evidence_refs: [],
  created_at: NOW,
  updated_at: NOW,
});

const createRelease = (input: {
  releaseId: string;
  packageId: string;
  sourcePath: string;
}): RegistryRelease => ({
  release_id: input.releaseId,
  package_id: input.packageId,
  package_type: 'app',
  package_version: '1.0.0',
  origin_class: 'nous_first_party',
  signing_key_id: 'key-1',
  signature_set_ref: 'sigset-1',
  source_hash: `sha256:${input.releaseId}`,
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
    artifact_digest: `sha256:${input.releaseId}`,
    metadata_digest: `sha256:${input.releaseId}-meta`,
  },
  dependencies: {
    packages: [],
    tool_requirements: [],
  },
  install_source_path: input.sourcePath,
  distribution_status: 'active',
  compatibility_state: 'compatible',
  evidence_refs: [],
  published_at: NOW,
});

describe('AppInstallService', () => {
  let instanceRoot: string;
  let appSource: string;
  let runtime: IRuntime;

  beforeEach(async () => {
    instanceRoot = mkdtempSync(join(tmpdir(), 'nous-app-install-service-'));
    appSource = join(instanceRoot, 'src-app');
    runtime = new TestRuntime();
    await mkdir(join(instanceRoot, '.apps'), { recursive: true });
    await mkdir(join(instanceRoot, '.skills'), { recursive: true });
    await mkdir(join(instanceRoot, '.workflows'), { recursive: true });
    await mkdir(join(instanceRoot, '.projects'), { recursive: true });
    await mkdir(join(instanceRoot, '.contracts'), { recursive: true });
    await mkdir(join(appSource, 'hooks'), { recursive: true });
    writeFileSync(
      join(appSource, 'manifest.json'),
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
          client_api_id: {
            type: 'string',
            required: false,
            label: 'Client API Id',
            group: 'full_client',
          },
          client_api_hash: {
            type: 'secret',
            required: false,
            label: 'Client API Hash',
            group: 'full_client',
          },
          client_phone_number: {
            type: 'string',
            required: false,
            label: 'Client Phone',
            group: 'full_client',
          },
        },
        adapters: [{ name: 'telegram' }],
        lifecycle: {
          onInstall: './hooks/install.ts',
        },
      }),
      'utf8',
    );
    writeFileSync(join(appSource, 'main.ts'), 'export default {};\n', 'utf8');
    writeFileSync(
      join(appSource, 'hooks', 'install.ts'),
      'export const onInstall = () => ({ status: "success", results: [] });\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(instanceRoot, { recursive: true, force: true });
  });

  it('activates a partial install while keeping secrets out of the runtime handshake config', async () => {
    const pkg = createPackage('telegram-connector');
    const release = createRelease({
      releaseId: 'release-app-1',
      packageId: pkg.package_id,
      sourcePath: appSource,
    });
    pkg.latest_release_id = release.release_id;
    const registryService = new FakeRegistryService(
      new Map([[pkg.package_id, pkg]]),
      new Map([[release.release_id, release]]),
    );
    const documentStore = new InMemoryDocumentStore();
    const configStore = new DocumentAppConfigStore(documentStore);
    const activate = vi.fn().mockResolvedValue({
      session_id: 'session-1',
    });
    const witnessService = {
      appendAuthorization: vi.fn().mockResolvedValue({ id: 'evt-auth' }),
      appendCompletion: vi.fn().mockResolvedValue({ id: 'evt-complete' }),
    };
    const service = new AppInstallService({
      registryService,
      packageInstallService: new PackageInstallService({
        registryService,
        lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
        runtime,
        instanceRoot,
      }),
      appCredentialInstallService: {
        storeSecretField: vi.fn().mockImplementation(async (appId: string, request: { key: string }) => ({
          credential_ref: `credential:${appId}:${request.key}`,
        })),
        openOAuthFlow: vi.fn(),
        revokeCredential: vi.fn().mockResolvedValue({
          revoked: true,
        }),
      } as any,
      appRuntimeService: {
        activate,
        deactivate: vi.fn(),
      } as any,
      configStore,
      installHookRunner: {
        runOnInstall: vi.fn().mockResolvedValue({
          status: 'partial',
          results: [
            {
              check: 'full-client-credentials-complete',
              passed: false,
              retryable: true,
            },
          ],
          metadata: {
            mode: 'connector',
          },
        }),
      } as any,
      runtime,
      instanceRoot,
      witnessService: witnessService as any,
    });

    const result = await service.installApp({
      project_id: '550e8400-e29b-41d4-a716-446655440701' as any,
      package_id: pkg.package_id,
      actor_id: 'web-test',
      permissions_approved: true,
      config: {
        client_api_id: '12345',
        client_phone_number: '+15555555555',
      },
      secrets: {
        bot_token: 'secret-bot-token',
        client_api_hash: 'secret-client-hash',
      },
      oauth: [],
      evidence_refs: [],
    });

    expect(result.status).toBe('partial');
    expect(result.witness_refs).toEqual(['evt-auth', 'evt-complete']);
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: [
          expect.objectContaining({ key: 'client_api_id', value: '12345' }),
          expect.objectContaining({
            key: 'client_phone_number',
            value: '+15555555555',
          }),
        ],
        secret_config: expect.objectContaining({
          bot_token: expect.objectContaining({ configured: true }),
          client_api_hash: expect.objectContaining({ configured: true }),
        }),
      }),
    );
    const storedConfig = await configStore.get(
      '550e8400-e29b-41d4-a716-446655440701' as any,
      pkg.package_id,
    );
    expect(storedConfig?.values).toEqual({
      client_api_id: '12345',
      client_phone_number: '+15555555555',
    });
    expect(storedConfig?.secret_config.client_api_hash?.configured).toBe(true);
    expect(witnessService.appendAuthorization).toHaveBeenCalledTimes(1);
    expect(witnessService.appendCompletion).toHaveBeenCalledTimes(1);
  });

  it('rolls back config and stored credentials when activation fails', async () => {
    const pkg = createPackage('telegram-connector');
    const release = createRelease({
      releaseId: 'release-app-2',
      packageId: pkg.package_id,
      sourcePath: appSource,
    });
    pkg.latest_release_id = release.release_id;
    const registryService = new FakeRegistryService(
      new Map([[pkg.package_id, pkg]]),
      new Map([[release.release_id, release]]),
    );
    const documentStore = new InMemoryDocumentStore();
    const configStore = new DocumentAppConfigStore(documentStore);
    const revokeCredential = vi.fn().mockResolvedValue({
      revoked: true,
    });
    const service = new AppInstallService({
      registryService,
      packageInstallService: new PackageInstallService({
        registryService,
        lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
        runtime,
        instanceRoot,
      }),
      appCredentialInstallService: {
        storeSecretField: vi.fn().mockImplementation(async (appId: string, request: { key: string }) => ({
          credential_ref: `credential:${appId}:${request.key}`,
        })),
        openOAuthFlow: vi.fn(),
        revokeCredential,
      } as any,
      appRuntimeService: {
        activate: vi.fn().mockRejectedValue(new Error('activation failed')),
        deactivate: vi.fn(),
      } as any,
      configStore,
      installHookRunner: {
        runOnInstall: vi.fn().mockResolvedValue({
          status: 'success',
          results: [],
          metadata: {},
        }),
      } as any,
      runtime,
      instanceRoot,
    });

    const result = await service.installApp({
      project_id: '550e8400-e29b-41d4-a716-446655440702' as any,
      package_id: pkg.package_id,
      actor_id: 'web-test',
      permissions_approved: true,
      config: {},
      secrets: {
        bot_token: 'secret-bot-token',
      },
      oauth: [],
      evidence_refs: [],
    });

    expect(result.status).toBe('failed');
    expect(result.phase).toBe('activation');
    expect(
      await configStore.get(
        '550e8400-e29b-41d4-a716-446655440702' as any,
        pkg.package_id,
      ),
    ).toBeNull();
    expect(revokeCredential).toHaveBeenCalledWith('telegram', {
      key: 'bot_token',
      reason: 'install rollback',
    });
    expect(await runtime.exists(join(instanceRoot, '.apps', pkg.package_id))).toBe(false);
  });

  it('rolls back the install when the OAuth setup path is cancelled or fails', async () => {
    const pkg = createPackage('telegram-connector');
    const release = createRelease({
      releaseId: 'release-app-3',
      packageId: pkg.package_id,
      sourcePath: appSource,
    });
    pkg.latest_release_id = release.release_id;
    const registryService = new FakeRegistryService(
      new Map([[pkg.package_id, pkg]]),
      new Map([[release.release_id, release]]),
    );
    const service = new AppInstallService({
      registryService,
      packageInstallService: new PackageInstallService({
        registryService,
        lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
        runtime,
        instanceRoot,
      }),
      appCredentialInstallService: {
        storeSecretField: vi.fn().mockResolvedValue({
          credential_ref: 'credential:telegram:bot_token',
        }),
        openOAuthFlow: vi.fn().mockResolvedValue({
          status: 'cancelled',
          reason: 'oauth_cancelled',
        }),
        revokeCredential: vi.fn().mockResolvedValue({
          revoked: true,
        }),
      } as any,
      appRuntimeService: {
        activate: vi.fn(),
        deactivate: vi.fn(),
      } as any,
      configStore: new DocumentAppConfigStore(new InMemoryDocumentStore()),
      installHookRunner: {
        runOnInstall: vi.fn(),
      } as any,
      runtime,
      instanceRoot,
    });

    const result = await service.installApp({
      project_id: '550e8400-e29b-41d4-a716-446655440703' as any,
      package_id: pkg.package_id,
      actor_id: 'web-test',
      permissions_approved: true,
      config: {},
      secrets: {
        bot_token: 'secret-bot-token',
      },
      oauth: [
        {
          key: 'oauth_token',
          provider: 'telegram',
          scopes: [],
          metadata: {},
          target_host: 'api.telegram.org',
          injection_location: 'header',
          injection_key: 'Authorization',
        },
      ],
      evidence_refs: [],
    });

    expect(result.status).toBe('failed');
    expect(result.rollback_applied).toBe(true);
    expect(await runtime.exists(join(instanceRoot, '.apps', pkg.package_id))).toBe(false);
  });
});
