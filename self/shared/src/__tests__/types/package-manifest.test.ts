import { describe, it, expect } from 'vitest';
import {
  NousPackageManifestSchema,
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

  it('accepts a valid project manifest', () => {
    const result = NousPackageManifestSchema.safeParse({
      ...BASE_MANIFEST,
      package_type: 'project',
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
});

