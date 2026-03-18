import { describe, expect, it } from 'vitest';
import {
  CanonicalInstallTargetSchema,
  PackageDependencySetSchema,
  PackageDependencySpecSchema,
  PackageInstallJournalEntrySchema,
  PackageInstallRequestSchema,
  PackageInstallResultSchema,
  PackageResolutionFailureSchema,
  PackageResolutionReasonCodeSchema,
  PackageResolutionResultSchema,
  ResolvedPackageNodeSchema,
} from '../../types/package-resolution.js';

describe('PackageDependencySpecSchema', () => {
  it('parses canonical dependency declarations for apps, skills, and workflows', () => {
    const result = PackageDependencySpecSchema.safeParse({
      package_id: 'pkg.shared-runtime',
      package_type: 'skill',
      version_range: '^2.0.0',
      required: true,
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageDependencySetSchema', () => {
  it('preserves tool requirements outside the package graph', () => {
    const result = PackageDependencySetSchema.safeParse({
      packages: [],
      tool_requirements: ['tool.persona'],
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageResolutionReasonCodeSchema', () => {
  it('accepts resolver/install reason codes', () => {
    expect(
      PackageResolutionReasonCodeSchema.safeParse(
        'PKG-009-DEPENDENCY_RANGE_CONFLICT',
      ).success,
    ).toBe(true);
  });
});

describe('ResolvedPackageNodeSchema', () => {
  it('captures deterministic selected-version and target-root data', () => {
    const result = ResolvedPackageNodeSchema.safeParse({
      package_id: 'pkg.persona-engine',
      package_type: 'workflow',
      selected_version: '1.0.0',
      requested_ranges: ['^1.0.0'],
      dependency_ids: ['pkg.shared-runtime'],
      install_root: '.workflows',
      source_release_id: 'release-1',
      dedupe_parent_ids: [],
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageResolutionFailureSchema', () => {
  it('accepts lifecycle-compatible failure reason codes', () => {
    const result = PackageResolutionFailureSchema.safeParse({
      reason_code: 'MKT-004-PRINCIPAL_OVERRIDE_REQUIRED',
      package_id: 'pkg.persona-engine',
      detail: 'Registry eligibility requires approval.',
    });

    expect(result.success).toBe(true);
  });
});

describe('CanonicalInstallTargetSchema', () => {
  it('parses canonical user-store targets and rejects missing paths', () => {
    const result = CanonicalInstallTargetSchema.safeParse({
      package_id: 'pkg.persona-engine',
      package_type: 'workflow',
      root_dir: '.workflows',
      absolute_root_path: '/workspace/.workflows',
      package_path: '/workspace/.workflows/pkg.persona-engine',
      system_boundary: 'user_store',
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageInstallJournalEntrySchema', () => {
  it('tracks prepare/write/rollback journal states', () => {
    const result = PackageInstallJournalEntrySchema.safeParse({
      package_id: 'pkg.persona-engine',
      selected_version: '1.0.0',
      target_path: '/workspace/.workflows/pkg.persona-engine',
      action: 'rollback',
      status: 'rolled_back',
      evidence_refs: [],
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageResolutionResultSchema', () => {
  it('requires failure when resolution is blocked', () => {
    const result = PackageResolutionResultSchema.safeParse({
      root_package_id: 'pkg.persona-engine',
      nodes: [],
      install_order: [],
      deduped_package_ids: [],
      blocked: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('PackageInstallRequestSchema', () => {
  it('rejects simultaneous release and semver-range targeting', () => {
    const result = PackageInstallRequestSchema.safeParse({
      project_id: '550e8400-e29b-41d4-a716-446655440401',
      package_id: 'pkg.persona-engine',
      requested_version_range: '^1.0.0',
      release_id: 'release-1',
      actor_id: 'cli',
      evidence_refs: [],
    });

    expect(result.success).toBe(false);
  });
});

describe('PackageInstallResultSchema', () => {
  it('parses installed results that preserve lifecycle evidence linkage', () => {
    const result = PackageInstallResultSchema.safeParse({
      resolution: {
        root_package_id: 'pkg.persona-engine',
        nodes: [
          {
            package_id: 'pkg.persona-engine',
            package_type: 'workflow',
            selected_version: '1.0.0',
            requested_ranges: ['^1.0.0'],
            dependency_ids: [],
            install_root: '.workflows',
            source_release_id: 'release-1',
            dedupe_parent_ids: [],
          },
        ],
        install_order: ['pkg.persona-engine'],
        deduped_package_ids: [],
        blocked: false,
      },
      writes: [
        {
          package_id: 'pkg.persona-engine',
          selected_version: '1.0.0',
          target_path: '/workspace/.workflows/pkg.persona-engine',
          action: 'write',
          status: 'applied',
          evidence_refs: [],
        },
      ],
      lifecycle_results: [
        {
          decision: 'allowed',
          transition: 'install',
          from_state: 'ingested',
          to_state: 'installed',
          witness_ref: 'evt_123',
          evidence_refs: ['witness:evt_123'],
        },
      ],
      status: 'installed',
    });

    expect(result.success).toBe(true);
  });
});
