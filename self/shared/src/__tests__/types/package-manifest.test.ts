import { describe, it, expect } from 'vitest';
import {
  NormalizedNousPackageManifestSchema,
  NousPackageManifestSchema,
  normalizePackageType,
  parseCanonicalNousPackageManifest,
  validateNousPackageManifest,
} from '../../types/package-manifest.js';

const BASE_MANIFEST = {
  id: 'skill:image-quality-assessment',
  name: 'Image Quality Assessment',
  version: '1.2.0',
  package_type: 'skill',
  origin_class: 'third_party_external',
  api_contract_range: '^1.0.0',
  capabilities: ['model.invoke'],
} as const;

describe('NousPackageManifestSchema', () => {
  it('accepts a valid skill manifest', () => {
    const result = NousPackageManifestSchema.safeParse(BASE_MANIFEST);
    expect(result.success).toBe(true);
  });

  it.each(['project', 'app', 'workflow'])(
    'accepts a valid %s manifest at ingress',
    (packageType) => {
      const result = NousPackageManifestSchema.safeParse({
        ...BASE_MANIFEST,
        package_type: packageType,
      });
      expect(result.success).toBe(true);
    },
  );

  it('normalizes the legacy project alias to workflow', () => {
    expect(normalizePackageType('project')).toBe('workflow');
    expect(
      NormalizedNousPackageManifestSchema.parse({
        ...BASE_MANIFEST,
        package_type: 'project',
      }).package_type,
    ).toBe('workflow');
  });

  it('parses canonical manifests directly from raw input', () => {
    const manifest = parseCanonicalNousPackageManifest({
      ...BASE_MANIFEST,
      package_type: 'workflow',
    });

    expect(manifest.package_type).toBe('workflow');
  });

  it('preserves app manifests when canonicalized', () => {
    const manifest = parseCanonicalNousPackageManifest({
      ...BASE_MANIFEST,
      package_type: 'app',
    });

    expect(manifest.package_type).toBe('app');
  });

  it('accepts a valid project manifest', () => {
    const result = NousPackageManifestSchema.safeParse({
      ...BASE_MANIFEST,
      package_type: 'project',
    });
    expect(result.success).toBe(true);
  });

  it('accepts dependency declarations and preserves tool requirements', () => {
    const result = NousPackageManifestSchema.safeParse({
      ...BASE_MANIFEST,
      dependencies: {
        packages: [
          {
            package_id: 'pkg.shared-runtime',
            package_type: 'skill',
            version_range: '^2.0.0',
            required: true,
          },
        ],
        tool_requirements: ['tool.persona'],
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid package_type values', () => {
    const result = NousPackageManifestSchema.safeParse({
      ...BASE_MANIFEST,
      package_type: 'plugin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing api_contract_range', () => {
    const { api_contract_range: _removed, ...manifest } = BASE_MANIFEST;
    const result = NousPackageManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('rejects missing capabilities', () => {
    const { capabilities: _removed, ...manifest } = BASE_MANIFEST;
    const result = NousPackageManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('requires self_created_local ownership fields', () => {
    const result = NousPackageManifestSchema.safeParse({
      ...BASE_MANIFEST,
      origin_class: 'self_created_local',
    });
    expect(result.success).toBe(false);
  });
});

describe('validateNousPackageManifest', () => {
  it('returns deterministic issue paths for invalid manifest values', () => {
    const result = validateNousPackageManifest({
      ...BASE_MANIFEST,
      package_type: 'plugin',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toContain('package_type');
    }
  });

  it('returns deterministic issue paths for missing self-created ownership fields', () => {
    const result = validateNousPackageManifest({
      ...BASE_MANIFEST,
      origin_class: 'self_created_local',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join('\n')).toContain('author_principal_id');
      expect(result.issues.join('\n')).toContain('origin_instance_id');
    }
  });
});

