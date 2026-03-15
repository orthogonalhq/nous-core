import { describe, expect, it } from 'vitest';
import {
  AppAdapterDeclarationSchema,
  AppConfigSchema,
  AppLifecycleHooksSchema,
  AppPackageManifestSchema,
  AppPanelDeclarationSchema,
  AppPermissionsSchema,
  AppToolDeclarationSchema,
  InstallValidationResultSchema,
  OAuthConfigSchema,
  OAuthResultSchema,
} from '../../types/app-manifest.js';

const BASE_APP_TOOL = {
  name: 'summarize',
  description: 'Summarize project notes',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  riskLevel: 'medium',
  idempotent: true,
} as const;

describe('AppPermissionsSchema', () => {
  it('defaults optional permission flags safely', () => {
    const result = AppPermissionsSchema.parse({});

    expect(result).toEqual({
      network: [],
      credentials: false,
      witnessLevel: 'none',
      systemNotify: false,
      memoryContribute: false,
    });
  });

  it('rejects invalid witness levels', () => {
    const result = AppPermissionsSchema.safeParse({
      witnessLevel: 'always',
    });

    expect(result.success).toBe(false);
  });
});

describe('AppToolDeclarationSchema', () => {
  it('accepts canonical app tool declarations', () => {
    expect(AppToolDeclarationSchema.safeParse(BASE_APP_TOOL).success).toBe(true);
  });

  it('rejects malformed tool declarations with missing schemas', () => {
    const result = AppToolDeclarationSchema.safeParse({
      ...BASE_APP_TOOL,
      inputSchema: undefined,
    });

    expect(result.success).toBe(false);
  });
});

describe('AppConfigSchema', () => {
  it('accepts select config fields with options', () => {
    const result = AppConfigSchema.safeParse({
      mode: {
        type: 'select',
        required: true,
        options: ['draft', 'live'],
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects malformed select options', () => {
    const result = AppConfigSchema.safeParse({
      mode: {
        type: 'select',
        options: [''],
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('AppPanelDeclarationSchema', () => {
  it('accepts declarative panel metadata only', () => {
    const result = AppPanelDeclarationSchema.safeParse({
      panelId: 'inspector',
      label: 'Inspector',
      entry: './panels/inspector.tsx',
      position: 'right',
      badge: {
        type: 'count',
        value: 2,
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('AppLifecycleHooksSchema', () => {
  it('accepts optional lifecycle hook references', () => {
    expect(
      AppLifecycleHooksSchema.safeParse({
        onInstall: 'hooks/install.ts',
        onActivate: 'hooks/activate.ts',
      }).success,
    ).toBe(true);
  });
});

describe('InstallValidationResultSchema', () => {
  it('accepts install validation summaries', () => {
    expect(
      InstallValidationResultSchema.safeParse({
        status: 'partial',
        results: [
          {
            check: 'oauth-ready',
            passed: false,
            retryable: true,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('OAuthConfigSchema and OAuthResultSchema', () => {
  it('accept provider-agnostic oauth metadata and results', () => {
    expect(
      OAuthConfigSchema.safeParse({
        provider: 'github',
        scopes: ['repo'],
        callbackPath: '/oauth/callback',
      }).success,
    ).toBe(true);
    expect(
      OAuthResultSchema.safeParse({
        status: 'success',
        grantedScopes: ['repo'],
      }).success,
    ).toBe(true);
  });
});

describe('AppAdapterDeclarationSchema', () => {
  it('accepts thin adapter metadata declarations', () => {
    expect(
      AppAdapterDeclarationSchema.safeParse({
        name: 'telegram',
        healthCheckRef: 'health/telegram',
      }).success,
    ).toBe(true);
  });
});

describe('AppPackageManifestSchema', () => {
  it('accepts app manifests with required permissions and tools', () => {
    const result = AppPackageManifestSchema.safeParse({
      id: 'app:notes-inspector',
      name: 'Notes Inspector',
      version: '1.0.0',
      package_type: 'app',
      origin_class: 'third_party_external',
      api_contract_range: '^1.0.0',
      capabilities: ['tool.invoke'],
      permissions: {
        network: ['api.example.com'],
      },
      tools: [BASE_APP_TOOL],
      panels: [
        {
          panelId: 'inspector',
          label: 'Inspector',
          entry: './panel.tsx',
        },
      ],
      config: {
        apiKey: {
          type: 'secret',
          required: true,
        },
      },
      adapters: [
        {
          name: 'telegram',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects app manifests without tool declarations', () => {
    const result = AppPackageManifestSchema.safeParse({
      id: 'app:notes-inspector',
      name: 'Notes Inspector',
      version: '1.0.0',
      package_type: 'app',
      origin_class: 'third_party_external',
      api_contract_range: '^1.0.0',
      capabilities: ['tool.invoke'],
      permissions: {},
      tools: [],
    });

    expect(result.success).toBe(false);
  });
});
