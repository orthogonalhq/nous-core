import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  IRegistryService,
  IRuntime,
  PlatformInfo,
  RegistryInstallEligibilitySnapshot,
  RegistryPackage,
  RegistryRelease,
} from '@nous/shared';
import { PackageLifecycleOrchestrator } from '../package-lifecycle/orchestrator.js';
import { PackageInstallService } from '../package-install/service.js';

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
    await mkdir(to, { recursive: true });
    const payload = readFileSync(join(from, 'payload.txt'), 'utf-8');
    writeFileSync(join(to, 'payload.txt'), payload, 'utf-8');
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

const NOW = '2026-03-16T00:00:00.000Z';

const createPackage = (
  packageId: string,
  packageType: RegistryPackage['package_type'],
): RegistryPackage => ({
  package_id: packageId,
  package_type: packageType,
  display_name: packageId,
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
  packageType: RegistryRelease['package_type'];
  version: string;
  sourcePath: string;
  dependencies?: RegistryRelease['dependencies'];
  publishedAt?: string;
}): RegistryRelease => ({
  release_id: input.releaseId,
  package_id: input.packageId,
  package_type: input.packageType,
  package_version: input.version,
  origin_class: 'third_party_external',
  signing_key_id: 'key-1',
  signature_set_ref: 'sigset-1',
  source_hash: `sha256:${input.releaseId}`,
  compatibility: {
    api_contract_range: '^1.0.0',
    capability_manifest: ['model.invoke'],
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
    metadata_expires_at: '2027-03-16T00:00:00.000Z',
    artifact_digest: `sha256:${input.releaseId}`,
    metadata_digest: `sha256:${input.releaseId}-meta`,
  },
  dependencies: input.dependencies ?? {
    packages: [],
    tool_requirements: [],
  },
  install_source_path: input.sourcePath,
  distribution_status: 'active',
  compatibility_state: 'compatible',
  evidence_refs: [],
  published_at: input.publishedAt ?? NOW,
});

describe('PackageInstallService', () => {
  let instanceRoot: string;
  let runtime: IRuntime;

  beforeEach(async () => {
    instanceRoot = mkdtempSync(join(tmpdir(), 'nous-install-service-'));
    runtime = new TestRuntime();
    await mkdir(join(instanceRoot, '.apps'), { recursive: true });
    await mkdir(join(instanceRoot, '.skills'), { recursive: true });
    await mkdir(join(instanceRoot, '.workflows'), { recursive: true });
    await mkdir(join(instanceRoot, '.projects'), { recursive: true });
    await mkdir(join(instanceRoot, '.contracts'), { recursive: true });
  });

  afterEach(async () => {
    await rm(instanceRoot, { recursive: true, force: true });
  });

  it('resolves one shared dependency graph with dedupe, canonical placement, and workflow alias normalization', async () => {
    const sharedSource = join(instanceRoot, 'src-shared');
    const skillSource = join(instanceRoot, 'src-skill');
    const workflowSource = join(instanceRoot, 'src-workflow');
    await mkdir(sharedSource, { recursive: true });
    await mkdir(skillSource, { recursive: true });
    await mkdir(workflowSource, { recursive: true });
    writeFileSync(join(sharedSource, 'payload.txt'), 'shared-v2', 'utf-8');
    writeFileSync(join(skillSource, 'payload.txt'), 'skill-v1', 'utf-8');
    writeFileSync(join(workflowSource, 'payload.txt'), 'workflow-v1', 'utf-8');

    const packages = new Map<string, RegistryPackage>([
      ['pkg.shared-runtime', createPackage('pkg.shared-runtime', 'skill')],
      ['pkg.skill-bundle', createPackage('pkg.skill-bundle', 'skill')],
      ['pkg.persona-engine', createPackage('pkg.persona-engine', 'workflow')],
    ]);
    const releases = new Map<string, RegistryRelease>([
      [
        'release-shared-2',
        createRelease({
          releaseId: 'release-shared-2',
          packageId: 'pkg.shared-runtime',
          packageType: 'skill',
          version: '2.1.0',
          sourcePath: sharedSource,
        }),
      ],
      [
        'release-skill-1',
        createRelease({
          releaseId: 'release-skill-1',
          packageId: 'pkg.skill-bundle',
          packageType: 'skill',
          version: '1.0.0',
          sourcePath: skillSource,
          dependencies: {
            packages: [
              {
                package_id: 'pkg.shared-runtime',
                package_type: 'skill',
                version_range: '^2.0.0',
                required: true,
              },
            ],
            tool_requirements: [],
          },
        }),
      ],
      [
        'release-workflow-1',
        createRelease({
          releaseId: 'release-workflow-1',
          packageId: 'pkg.persona-engine',
          packageType: 'workflow',
          version: '1.0.0',
          sourcePath: workflowSource,
          dependencies: {
            packages: [
              {
                package_id: 'pkg.skill-bundle',
                package_type: 'skill',
                version_range: '^1.0.0',
                required: true,
              },
              {
                package_id: 'pkg.shared-runtime',
                package_type: 'skill',
                version_range: '^2.0.0',
                required: true,
              },
            ],
            tool_requirements: ['tool.persona'],
          },
        }),
      ],
    ]);
    for (const [packageId, registryPackage] of packages) {
      const packageReleases = [...releases.values()].filter(
        (release) => release.package_id === packageId,
      );
      registryPackage.latest_release_id = packageReleases[0]?.release_id;
    }

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(packages, releases),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    const result = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440501' as any,
      package_id: 'pkg.persona-engine',
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.status).toBe('installed');
    expect(result.resolution.install_order).toEqual([
      'pkg.shared-runtime',
      'pkg.skill-bundle',
      'pkg.persona-engine',
    ]);
    expect(result.resolution.deduped_package_ids).toEqual(['pkg.shared-runtime']);
    expect(
      result.resolution.nodes.find((node) => node.package_id === 'pkg.persona-engine')
        ?.package_type,
    ).toBe('workflow');
    expect(
      readFileSync(
        join(instanceRoot, '.skills', 'pkg.shared-runtime', 'payload.txt'),
        'utf-8',
      ),
    ).toBe('shared-v2');
    expect(
      readFileSync(
        join(instanceRoot, '.workflows', 'pkg.persona-engine', 'payload.txt'),
        'utf-8',
      ),
    ).toBe('workflow-v1');
  });

  it('fails closed with explicit conflict reason codes when shared dependency ranges cannot be satisfied', async () => {
    const sharedV1 = join(instanceRoot, 'src-shared-v1');
    const sharedV2 = join(instanceRoot, 'src-shared-v2');
    const skillSource = join(instanceRoot, 'src-skill');
    const workflowSource = join(instanceRoot, 'src-workflow');
    await mkdir(sharedV1, { recursive: true });
    await mkdir(sharedV2, { recursive: true });
    await mkdir(skillSource, { recursive: true });
    await mkdir(workflowSource, { recursive: true });
    writeFileSync(join(sharedV1, 'payload.txt'), 'shared-v1', 'utf-8');
    writeFileSync(join(sharedV2, 'payload.txt'), 'shared-v2', 'utf-8');
    writeFileSync(join(skillSource, 'payload.txt'), 'skill-v1', 'utf-8');
    writeFileSync(join(workflowSource, 'payload.txt'), 'workflow-v1', 'utf-8');

    const packages = new Map<string, RegistryPackage>([
      ['pkg.shared-runtime', createPackage('pkg.shared-runtime', 'skill')],
      ['pkg.skill-bundle', createPackage('pkg.skill-bundle', 'skill')],
      ['pkg.persona-engine', createPackage('pkg.persona-engine', 'workflow')],
    ]);
    const releases = new Map<string, RegistryRelease>([
      [
        'release-shared-1',
        createRelease({
          releaseId: 'release-shared-1',
          packageId: 'pkg.shared-runtime',
          packageType: 'skill',
          version: '1.5.0',
          sourcePath: sharedV1,
        }),
      ],
      [
        'release-shared-2',
        createRelease({
          releaseId: 'release-shared-2',
          packageId: 'pkg.shared-runtime',
          packageType: 'skill',
          version: '2.1.0',
          sourcePath: sharedV2,
        }),
      ],
      [
        'release-skill-1',
        createRelease({
          releaseId: 'release-skill-1',
          packageId: 'pkg.skill-bundle',
          packageType: 'skill',
          version: '1.0.0',
          sourcePath: skillSource,
          dependencies: {
            packages: [
              {
                package_id: 'pkg.shared-runtime',
                package_type: 'skill',
                version_range: '^2.0.0',
                required: true,
              },
            ],
            tool_requirements: [],
          },
        }),
      ],
      [
        'release-workflow-1',
        createRelease({
          releaseId: 'release-workflow-1',
          packageId: 'pkg.persona-engine',
          packageType: 'workflow',
          version: '1.0.0',
          sourcePath: workflowSource,
          dependencies: {
            packages: [
              {
                package_id: 'pkg.skill-bundle',
                package_type: 'skill',
                version_range: '^1.0.0',
                required: true,
              },
              {
                package_id: 'pkg.shared-runtime',
                package_type: 'skill',
                version_range: '^1.0.0',
                required: true,
              },
            ],
            tool_requirements: [],
          },
        }),
      ],
    ]);
    for (const [packageId, registryPackage] of packages) {
      const packageReleases = [...releases.values()].filter(
        (release) => release.package_id === packageId,
      );
      registryPackage.latest_release_id = packageReleases[0]?.release_id;
    }

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(packages, releases),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    const result = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440502' as any,
      package_id: 'pkg.persona-engine',
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.status).toBe('blocked');
    expect(result.failure?.reason_code).toBe('PKG-009-DEPENDENCY_RANGE_CONFLICT');
  });

  it('prefers the newest published release when equal versions tie during resolution', async () => {
    const olderSource = join(instanceRoot, 'src-workflow-older');
    const newerSource = join(instanceRoot, 'src-workflow-newer');
    await mkdir(olderSource, { recursive: true });
    await mkdir(newerSource, { recursive: true });
    writeFileSync(join(olderSource, 'payload.txt'), 'workflow-old', 'utf-8');
    writeFileSync(join(newerSource, 'payload.txt'), 'workflow-new', 'utf-8');

    const pkg = createPackage('pkg.persona-engine', 'workflow');
    const olderRelease = createRelease({
      releaseId: 'release-older',
      packageId: pkg.package_id,
      packageType: 'workflow',
      version: '1.0.0',
      sourcePath: olderSource,
      publishedAt: '2026-03-16T00:00:00.000Z',
    });
    const newerRelease = createRelease({
      releaseId: 'release-newer',
      packageId: pkg.package_id,
      packageType: 'workflow',
      version: '1.0.0',
      sourcePath: newerSource,
      publishedAt: '2026-03-16T01:00:00.000Z',
    });
    pkg.latest_release_id = newerRelease.release_id;

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(
        new Map([[pkg.package_id, pkg]]),
        new Map([
          [olderRelease.release_id, olderRelease],
          [newerRelease.release_id, newerRelease],
        ]),
      ),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    const result = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440503' as any,
      package_id: pkg.package_id,
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.status).toBe('installed');
    expect(result.resolution.nodes[0]?.source_release_id).toBe(newerRelease.release_id);
    expect(
      readFileSync(
        join(instanceRoot, '.workflows', 'pkg.persona-engine', 'payload.txt'),
        'utf-8',
      ),
    ).toBe('workflow-new');
  });
});
