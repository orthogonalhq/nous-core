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
  published_at: NOW,
});

describe('Package install integration flows', () => {
  let instanceRoot: string;
  let runtime: IRuntime;

  beforeEach(async () => {
    instanceRoot = mkdtempSync(join(tmpdir(), 'nous-install-integration-'));
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

  it('updates an installed workflow and preserves rollback posture on success', async () => {
    const v1Source = join(instanceRoot, 'src-workflow-v1');
    const v2Source = join(instanceRoot, 'src-workflow-v2');
    await mkdir(v1Source, { recursive: true });
    await mkdir(v2Source, { recursive: true });
    writeFileSync(join(v1Source, 'payload.txt'), 'workflow-v1', 'utf-8');
    writeFileSync(join(v2Source, 'payload.txt'), 'workflow-v2', 'utf-8');

    const pkg = createPackage('pkg.persona-engine', 'workflow');
    const releaseV1 = createRelease({
      releaseId: 'release-1',
      packageId: 'pkg.persona-engine',
      packageType: 'workflow',
      version: '1.0.0',
      sourcePath: v1Source,
    });
    const releaseV2 = createRelease({
      releaseId: 'release-2',
      packageId: 'pkg.persona-engine',
      packageType: 'workflow',
      version: '1.1.0',
      sourcePath: v2Source,
    });
    pkg.latest_release_id = releaseV2.release_id;

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(
        new Map([[pkg.package_id, pkg]]),
        new Map([
          [releaseV1.release_id, releaseV1],
          [releaseV2.release_id, releaseV2],
        ]),
      ),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    const installV1 = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440601' as any,
      package_id: pkg.package_id,
      release_id: releaseV1.release_id,
      actor_id: 'cli',
      evidence_refs: [],
    });
    const installV2 = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440601' as any,
      package_id: pkg.package_id,
      release_id: releaseV2.release_id,
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(installV1.status).toBe('installed');
    expect(installV2.status).toBe('installed');
    expect(
      installV2.lifecycle_results.map((result) => result.transition),
    ).toContain('stage_update');
    expect(
      installV2.lifecycle_results.map((result) => result.transition),
    ).toContain('commit_update');
    expect(
      readFileSync(
        join(instanceRoot, '.workflows', 'pkg.persona-engine', 'payload.txt'),
        'utf-8',
      ),
    ).toBe('workflow-v2');
  });

  it('rejects dependency cycles with deterministic reason-coded output', async () => {
    const sourceA = join(instanceRoot, 'src-a');
    const sourceB = join(instanceRoot, 'src-b');
    await mkdir(sourceA, { recursive: true });
    await mkdir(sourceB, { recursive: true });
    writeFileSync(join(sourceA, 'payload.txt'), 'a', 'utf-8');
    writeFileSync(join(sourceB, 'payload.txt'), 'b', 'utf-8');

    const packages = new Map<string, RegistryPackage>([
      ['pkg.a', createPackage('pkg.a', 'workflow')],
      ['pkg.b', createPackage('pkg.b', 'skill')],
    ]);
    const releaseA = createRelease({
      releaseId: 'release-a',
      packageId: 'pkg.a',
      packageType: 'workflow',
      version: '1.0.0',
      sourcePath: sourceA,
      dependencies: {
        packages: [
          {
            package_id: 'pkg.b',
            package_type: 'skill',
            version_range: '^1.0.0',
            required: true,
          },
        ],
        tool_requirements: [],
      },
    });
    const releaseB = createRelease({
      releaseId: 'release-b',
      packageId: 'pkg.b',
      packageType: 'skill',
      version: '1.0.0',
      sourcePath: sourceB,
      dependencies: {
        packages: [
          {
            package_id: 'pkg.a',
            package_type: 'workflow',
            version_range: '^1.0.0',
            required: true,
          },
        ],
        tool_requirements: [],
      },
    });
    packages.get('pkg.a')!.latest_release_id = releaseA.release_id;
    packages.get('pkg.b')!.latest_release_id = releaseB.release_id;

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(
        packages,
        new Map([
          [releaseA.release_id, releaseA],
          [releaseB.release_id, releaseB],
        ]),
      ),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    const result = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440602' as any,
      package_id: 'pkg.a',
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.status).toBe('blocked');
    expect(result.failure?.reason_code).toBe('PKG-009-DEPENDENCY_CYCLE');
  });

  it('rolls back earlier successful node writes when a later graph node fails during materialization', async () => {
    const dependencySource = join(instanceRoot, 'src-shared-runtime');
    await mkdir(dependencySource, { recursive: true });
    writeFileSync(join(dependencySource, 'payload.txt'), 'shared-runtime', 'utf-8');

    const packages = new Map<string, RegistryPackage>([
      ['pkg.shared-runtime', createPackage('pkg.shared-runtime', 'skill')],
      ['pkg.persona-engine', createPackage('pkg.persona-engine', 'workflow')],
    ]);
    const dependencyRelease = createRelease({
      releaseId: 'release-shared',
      packageId: 'pkg.shared-runtime',
      packageType: 'skill',
      version: '1.0.0',
      sourcePath: dependencySource,
    });
    const brokenRootRelease = createRelease({
      releaseId: 'release-root',
      packageId: 'pkg.persona-engine',
      packageType: 'workflow',
      version: '1.0.0',
      sourcePath: join(instanceRoot, 'missing-root-source'),
      dependencies: {
        packages: [
          {
            package_id: 'pkg.shared-runtime',
            package_type: 'skill',
            version_range: '^1.0.0',
            required: true,
          },
        ],
        tool_requirements: [],
      },
    });
    packages.get('pkg.shared-runtime')!.latest_release_id = dependencyRelease.release_id;
    packages.get('pkg.persona-engine')!.latest_release_id = brokenRootRelease.release_id;

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(
        packages,
        new Map([
          [dependencyRelease.release_id, dependencyRelease],
          [brokenRootRelease.release_id, brokenRootRelease],
        ]),
      ),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    const result = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440604' as any,
      package_id: 'pkg.persona-engine',
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.status).toBe('rolled_back');
    expect(result.failure?.reason_code).toBe('PKG-009-INSTALL_WRITE_FAILED');
    expect(
      result.writes.filter(
        (entry) =>
          entry.package_id === 'pkg.shared-runtime' &&
          entry.action === 'rollback' &&
          entry.status === 'rolled_back',
      ),
    ).toHaveLength(1);
    expect(await runtime.exists(join(instanceRoot, '.skills', 'pkg.shared-runtime'))).toBe(false);
    expect(await runtime.exists(join(instanceRoot, '.workflows', 'pkg.persona-engine'))).toBe(
      false,
    );
  });

  it('rolls back staged updates when a later write fails and restores the previous safe version', async () => {
    const v1Source = join(instanceRoot, 'src-workflow-stable');
    await mkdir(v1Source, { recursive: true });
    writeFileSync(join(v1Source, 'payload.txt'), 'workflow-stable', 'utf-8');

    const pkg = createPackage('pkg.persona-engine', 'workflow');
    const releaseV1 = createRelease({
      releaseId: 'release-1',
      packageId: 'pkg.persona-engine',
      packageType: 'workflow',
      version: '1.0.0',
      sourcePath: v1Source,
    });
    const releaseBroken = createRelease({
      releaseId: 'release-2',
      packageId: 'pkg.persona-engine',
      packageType: 'workflow',
      version: '1.1.0',
      sourcePath: join(instanceRoot, 'missing-source'),
    });
    pkg.latest_release_id = releaseBroken.release_id;

    const service = new PackageInstallService({
      registryService: new FakeRegistryService(
        new Map([[pkg.package_id, pkg]]),
        new Map([
          [releaseV1.release_id, releaseV1],
          [releaseBroken.release_id, releaseBroken],
        ]),
      ),
      lifecycleOrchestrator: new PackageLifecycleOrchestrator(),
      runtime,
      instanceRoot,
    });

    await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440603' as any,
      package_id: pkg.package_id,
      release_id: releaseV1.release_id,
      actor_id: 'cli',
      evidence_refs: [],
    });

    const result = await service.installPackage({
      project_id: '550e8400-e29b-41d4-a716-446655440603' as any,
      package_id: pkg.package_id,
      release_id: releaseBroken.release_id,
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.status).toBe('rolled_back');
    expect(result.failure?.reason_code).toBe('PKG-009-INSTALL_WRITE_FAILED');
    expect(
      readFileSync(
        join(instanceRoot, '.workflows', 'pkg.persona-engine', 'payload.txt'),
        'utf-8',
      ),
    ).toBe('workflow-stable');
  });
});
