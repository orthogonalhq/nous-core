import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AppConfig,
  AppConfigField,
  AppHandshakeConfigEntry,
  AppInstallHookResult,
  AppInstallPreparation,
  AppInstallPrepareRequest,
  AppInstallRequest,
  AppInstallResult,
  AppPanelRegistrationProjection,
  AppProjectConfigDocument,
  AppSecretConfigState,
  IAppCredentialInstallService,
  IAppInstallService,
  IAppRuntimeService,
  IPackageInstallService,
  IRegistryService,
  IRuntime,
  IWitnessService,
  LoadedAppPackage,
  RegistryPackage,
  RegistryRelease,
  WitnessEvent,
} from '@nous/shared';
import {
  AppInstallPreparationSchema,
  AppInstallRequestSchema,
  AppInstallResultSchema,
  AppPackageManifestSchema,
} from '@nous/shared';
import {
  buildAppLaunchSpec,
  InstallHookRunner,
} from '@nous/subcortex-apps';
import { DocumentAppConfigStore } from './config-store.js';
import { loadInstalledAppPackage } from '../package-store/index.js';

export interface AppInstallServiceOptions {
  registryService: IRegistryService;
  packageInstallService: IPackageInstallService;
  appCredentialInstallService: IAppCredentialInstallService;
  appRuntimeService: IAppRuntimeService;
  configStore: DocumentAppConfigStore;
  installHookRunner?: InstallHookRunner;
  runtime: IRuntime;
  witnessService?: IWitnessService;
  instanceRoot?: string;
  now?: () => string;
  idFactory?: () => string;
}

const SECRET_SENTINEL = '[vault:configured]';

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

const startCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const hasMeaningfulValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== undefined && value !== null;
};

const buildFieldDescriptor = (
  key: string,
  field: AppConfigField,
) => ({
  ...field,
  key,
  secret: field.type === 'secret',
});

export class AppInstallService implements IAppInstallService {
  private readonly installHookRunner: InstallHookRunner;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly instanceRoot: string;

  constructor(private readonly options: AppInstallServiceOptions) {
    this.installHookRunner = options.installHookRunner ?? new InstallHookRunner();
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.instanceRoot = options.instanceRoot ?? process.cwd();
  }

  async prepareInstall(
    request: AppInstallPrepareRequest,
  ): Promise<AppInstallPreparation> {
    const { release, manifest } = await this.resolveInstallTarget(request);
    return this.buildPreparation({
      packageId: request.package_id,
      release,
      manifest,
    });
  }

  async installApp(request: AppInstallRequest): Promise<AppInstallResult> {
    const parsed = AppInstallRequestSchema.parse(request);
    const { release, manifest } = await this.resolveInstallTarget(parsed);
    const preparation = this.buildPreparation({
      packageId: parsed.package_id,
      release,
      manifest,
    });

    if (!parsed.permissions_approved) {
      return AppInstallResultSchema.parse({
        status: 'failed',
        phase: 'permission_review',
        preparation,
        validation: {
          status: 'failed',
          results: [
            {
              check: 'permission-review-approved',
              passed: false,
              retryable: true,
              message: 'Install permissions must be explicitly approved before activation.',
            },
          ],
        },
        recoverable: true,
      });
    }

    const requiredValidation = this.validateRequiredConfig({
      manifestConfig: manifest.config,
      config: parsed.config,
      secrets: parsed.secrets,
    });
    if (requiredValidation.status === 'failed') {
      return AppInstallResultSchema.parse({
        status: 'failed',
        phase: 'configuration',
        preparation,
        validation: requiredValidation,
        recoverable: true,
      });
    }

    const witnessRefs: string[] = [];
    const authorization = await this.appendAuthorization(parsed, manifest, release);
    if (authorization) {
      witnessRefs.push(authorization.id);
    }

    const storedSecrets: AppSecretConfigState[] = [];
    let loadedApp: LoadedAppPackage | null = null;
    let runtimeSessionId: string | undefined;

    try {
      const packageInstall = await this.options.packageInstallService.installPackage({
        project_id: parsed.project_id,
        package_id: parsed.package_id,
        release_id: release.release_id,
        actor_id: parsed.actor_id,
        evidence_refs: parsed.evidence_refs,
      });
      if (packageInstall.status !== 'installed') {
        const completion = await this.appendCompletion({
          parsed,
          authorization,
          phase: 'validation',
          status: packageInstall.status === 'blocked' ? 'blocked' : 'failed',
          detail: {
            package_status: packageInstall.status,
            reason_code: packageInstall.failure?.reason_code,
          },
        });
        if (completion) {
          witnessRefs.push(completion.id);
        }
        return AppInstallResultSchema.parse({
          status: 'failed',
          phase: 'validation',
          preparation,
          validation: {
            status: 'failed',
            results: packageInstall.failure
              ? [
                  {
                    check: 'package-install',
                    passed: false,
                    retryable: true,
                    message: packageInstall.failure.detail ?? packageInstall.failure.reason_code,
                  },
                ]
              : [],
          },
          package_install: packageInstall,
          witness_refs: witnessRefs,
          recoverable: true,
        });
      }

      loadedApp = await loadInstalledAppPackage({
        instanceRoot: this.instanceRoot,
        runtime: this.options.runtime,
        packageId: parsed.package_id,
      });

      storedSecrets.push(
        ...(await this.storeSecrets({
          appId: manifest.id,
          secrets: parsed.secrets,
          oauth: parsed.oauth,
        })),
      );

      const installHookResult = await this.runInstallHook({
        parsed,
        manifest,
        loadedApp,
        storedSecrets,
      });
      const mergedValidation = {
        status: installHookResult.status,
        results: installHookResult.results,
      } satisfies AppInstallResult['validation'];

      if (installHookResult.status === 'failed') {
        await this.rollbackInstall({
          parsed,
          loadedApp,
          storedSecrets,
          runtimeSessionId,
        });
        const completion = await this.appendCompletion({
          parsed,
          authorization,
          phase: 'validation',
          status: 'failed',
          detail: {
            hook_status: installHookResult.status,
            validation_results: installHookResult.results.length,
          },
        });
        if (completion) {
          witnessRefs.push(completion.id);
        }
        return AppInstallResultSchema.parse({
          status: 'failed',
          phase: 'validation',
          preparation,
          validation: mergedValidation,
          package_install: packageInstall,
          stored_secrets: storedSecrets,
          witness_refs: witnessRefs,
          rollback_applied: true,
          recoverable: true,
          metadata: installHookResult.metadata,
        });
      }

      const configVersion = this.idFactory();
      const activationInput = this.buildActivationInput({
        projectId: parsed.project_id,
        loadedApp,
        release,
        configVersion,
        config: parsed.config,
        secretConfig: storedSecrets,
      });
      const session = await this.options.appRuntimeService.activate(activationInput);
      runtimeSessionId = session.session_id;

      const storedConfig = this.buildProjectConfigDocument({
        projectId: parsed.project_id,
        releaseId: release.release_id,
        loadedApp,
        configVersion,
        config: parsed.config,
        secretConfig: storedSecrets,
      });
      await this.options.configStore.put(storedConfig);

      const completion = await this.appendCompletion({
        parsed,
        authorization,
        phase: 'completed',
        status: 'succeeded',
        detail: {
          runtime_session_id: session.session_id,
          validation_status: installHookResult.status,
        },
      });
      if (completion) {
        witnessRefs.push(completion.id);
      }

      return AppInstallResultSchema.parse({
        status: installHookResult.status,
        phase: 'completed',
        preparation,
        validation: mergedValidation,
        package_install: packageInstall,
        runtime_session_id: session.session_id,
        app_config_version: configVersion,
        stored_secrets: storedSecrets,
        witness_refs: witnessRefs,
        rollback_applied: false,
        recoverable: true,
        metadata: installHookResult.metadata,
      });
    } catch (error) {
      await this.rollbackInstall({
        parsed,
        loadedApp,
        storedSecrets,
        runtimeSessionId,
      });
      const completion = await this.appendCompletion({
        parsed,
        authorization,
        phase: 'activation',
        status: 'failed',
        detail: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      if (completion) {
        witnessRefs.push(completion.id);
      }
      return AppInstallResultSchema.parse({
        status: 'failed',
        phase: 'activation',
        preparation,
        validation: {
          status: 'failed',
          results: [
            {
              check: 'activation',
              passed: false,
              retryable: true,
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        },
        stored_secrets: storedSecrets,
        activation_failure: {
          code: 'APP-INSTALL-ACTIVATION-FAILED',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
        witness_refs: witnessRefs,
        rollback_applied: true,
        recoverable: true,
      });
    }
  }

  private async resolveInstallTarget(input: {
    package_id: string;
    release_id?: string;
  }): Promise<{ packageRecord: RegistryPackage; release: RegistryRelease; manifest: LoadedAppPackage['manifest'] }> {
    const packageRecord = await this.options.registryService.getPackage(input.package_id);
    if (!packageRecord) {
      throw new Error(`Registry package not found: ${input.package_id}`);
    }

    const release =
      input.release_id != null
        ? await this.options.registryService.getRelease(input.release_id)
        : packageRecord.latest_release_id != null
          ? await this.options.registryService.getRelease(packageRecord.latest_release_id)
          : (await this.options.registryService.listReleases(input.package_id))[0] ?? null;
    if (!release || release.package_id !== input.package_id) {
      throw new Error(`Registry release not found for package ${input.package_id}`);
    }
    if (release.package_type !== 'app') {
      throw new Error(`Package ${input.package_id} is not an app package.`);
    }
    if (!release.install_source_path) {
      throw new Error(`App release ${release.release_id} is missing install_source_path.`);
    }

    const manifest = AppPackageManifestSchema.parse(
      JSON.parse(await readFile(join(release.install_source_path, 'manifest.json'), 'utf8')),
    );

    return {
      packageRecord,
      release,
      manifest,
    };
  }

  private buildPreparation(input: {
    packageId: string;
    release: RegistryRelease;
    manifest: LoadedAppPackage['manifest'];
  }): AppInstallPreparation {
    const groups = new Map<string, AppInstallPreparation['config_groups'][number]>();

    for (const [key, field] of Object.entries(
      input.manifest.config ?? {},
    ) as Array<[string, AppConfigField]>) {
      const descriptor = buildFieldDescriptor(key, field);
      const groupId = field.group ?? 'general';
      const existing = groups.get(groupId);
      if (existing) {
        existing.fields.push(descriptor);
        continue;
      }
      groups.set(groupId, {
        id: groupId,
        label: startCase(groupId),
        fields: [descriptor],
      });
    }

    for (const group of groups.values()) {
      group.fields.sort((left, right) => left.key.localeCompare(right.key));
    }

    return AppInstallPreparationSchema.parse({
      package_id: input.packageId,
      release_id: input.release.release_id,
      package_version: input.release.package_version,
      app_id: input.manifest.id,
      display_name: input.manifest.display_name ?? input.manifest.name,
      description: input.manifest.description,
      permissions: input.manifest.permissions,
      config_groups: [...groups.values()].sort((left, right) => left.id.localeCompare(right.id)),
      has_install_hook: Boolean(input.manifest.lifecycle?.onInstall),
    });
  }

  private validateRequiredConfig(input: {
    manifestConfig?: AppConfig;
    config: Record<string, unknown>;
    secrets: Record<string, string>;
  }): AppInstallResult['validation'] {
    const results: AppInstallResult['validation']['results'] = [];

    for (const [key, field] of Object.entries(input.manifestConfig ?? {})) {
      const resolvedValue =
        field.type === 'secret'
          ? input.secrets[key]
          : input.config[key] ?? field.default;
      if (field.required && !hasMeaningfulValue(resolvedValue)) {
        results.push({
          field: key,
          check: 'required-config-present',
          passed: false,
          retryable: true,
          message: `${field.label ?? startCase(key)} is required.`,
        });
        continue;
      }

      if (!hasMeaningfulValue(resolvedValue)) {
        continue;
      }

      if (field.type === 'number' && Number.isNaN(Number(resolvedValue))) {
        results.push({
          field: key,
          check: 'number-config-valid',
          passed: false,
          retryable: true,
          message: `${field.label ?? startCase(key)} must be a number.`,
        });
      }

      if (
        field.type === 'select' &&
        Array.isArray(field.options) &&
        !field.options.includes(String(resolvedValue))
      ) {
        results.push({
          field: key,
          check: 'select-config-valid',
          passed: false,
          retryable: true,
          message: `${field.label ?? startCase(key)} must be one of the declared options.`,
        });
      }
    }

    return {
      status: results.some((entry) => !entry.passed) ? 'failed' : 'success',
      results,
    };
  }

  private async storeSecrets(input: {
    appId: string;
    secrets: Record<string, string>;
    oauth: AppInstallRequest['oauth'];
  }): Promise<AppSecretConfigState[]> {
    const stored: AppSecretConfigState[] = [];

    for (const [key, value] of Object.entries(input.secrets)) {
      const result = await this.options.appCredentialInstallService.storeSecretField(
        input.appId,
        {
          key,
          value,
          credential_type: 'custom',
          target_host: 'install-config',
          injection_location: 'body',
          injection_key: key,
        },
      );
      stored.push({
        key,
        configured: true,
        credential_ref: result.credential_ref,
        source: 'secret_field',
      });
    }

    for (const request of input.oauth) {
      const result = await this.options.appCredentialInstallService.openOAuthFlow({
        app_id: input.appId,
        key: request.key,
        provider: request.provider,
        scopes: request.scopes,
        callbackPath: request.callbackPath,
        metadata: request.metadata,
        target_host: request.target_host,
        injection_location: request.injection_location,
        injection_key: request.injection_key ?? request.key,
      });
      if (result.status !== 'success') {
        throw new Error(result.reason ?? 'OAuth flow failed');
      }
      stored.push({
        key: request.key,
        configured: true,
        credential_ref: result.credentialRef,
        source: 'oauth',
        provider: request.provider,
      });
    }

    return stored;
  }

  private async runInstallHook(input: {
    parsed: AppInstallRequest;
    manifest: LoadedAppPackage['manifest'];
    loadedApp: LoadedAppPackage;
    storedSecrets: AppSecretConfigState[];
  }): Promise<AppInstallHookResult> {
    const secretConfig = Object.fromEntries(
      input.storedSecrets.map((entry) => [entry.key, entry]),
    );
    const config = this.resolveConfigWithSentinels({
      manifestConfig: input.manifest.config,
      config: input.parsed.config,
      secretConfig,
    });

    return this.installHookRunner.runOnInstall({
      hook_ref: input.manifest.lifecycle?.onInstall
        ? join(input.loadedApp.rootRef, input.manifest.lifecycle.onInstall)
        : undefined,
      payload: {
        app_id: input.manifest.id,
        package_id: input.parsed.package_id,
        project_id: input.parsed.project_id,
        config,
        secret_config: secretConfig,
      },
    });
  }

  private resolveConfigWithSentinels(input: {
    manifestConfig?: AppConfig;
    config: Record<string, unknown>;
    secretConfig: Record<string, AppSecretConfigState>;
  }): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, field] of Object.entries(input.manifestConfig ?? {})) {
      if (field.type === 'secret') {
        if (input.secretConfig[key]?.configured) {
          resolved[key] = SECRET_SENTINEL;
        }
        continue;
      }

      const value = input.config[key] ?? field.default;
      if (hasMeaningfulValue(value)) {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private buildActivationInput(input: {
    projectId: AppInstallRequest['project_id'];
    loadedApp: LoadedAppPackage;
    release: RegistryRelease;
    configVersion: string;
    config: Record<string, unknown>;
    secretConfig: AppSecretConfigState[];
  }) {
    const secretConfig = Object.fromEntries(
      input.secretConfig.map((entry) => [entry.key, entry]),
    );
    const resolvedConfigEntries = this.buildHandshakeConfigEntries({
      manifestConfig: input.loadedApp.manifest.config,
      config: input.config,
    });
    const appDataDir = this.options.runtime.resolvePath(
      this.options.runtime.getDataDir(),
      'apps',
      sanitizePackageId(input.loadedApp.packageId),
    );
    const panels: AppPanelRegistrationProjection[] = (input.loadedApp.manifest.panels ?? []).map(
      (panel: LoadedAppPackage['manifest']['panels'][number]) => ({
        app_id: input.loadedApp.manifest.id,
        session_id: 'install-wizard',
        panel_id: panel.panelId,
        label: panel.label,
        entry: panel.entry,
        position: panel.position,
        preserve_state: panel.preserveState,
      }),
    );

    return {
      project_id: input.projectId,
      package_root_ref: input.loadedApp.rootRef,
      manifest_ref: input.loadedApp.manifestRef,
      manifest: input.loadedApp.manifest,
      launch_spec: buildAppLaunchSpec({
        appId: input.loadedApp.manifest.id,
        packageId: input.loadedApp.packageId,
        packageVersion: input.loadedApp.packageVersion ?? input.release.package_version,
        manifest: {
          permissions: input.loadedApp.manifest.permissions,
        },
        entrypoint: input.loadedApp.entrypointRef,
        workingDirectory: input.loadedApp.rootRef,
        appDataDir,
        configVersion: input.configVersion,
        readPaths: [input.loadedApp.rootRef],
        writePaths: [appDataDir],
        lockfilePath: input.loadedApp.lockfileRef,
        manifestRef: input.loadedApp.manifestRef,
      }),
      config: resolvedConfigEntries,
      secret_config: secretConfig,
      allowed_outbound_tools: [],
      panels,
    };
  }

  private buildHandshakeConfigEntries(input: {
    manifestConfig?: AppConfig;
    config: Record<string, unknown>;
  }): AppHandshakeConfigEntry[] {
    const entries: AppHandshakeConfigEntry[] = [];

    for (const [key, field] of Object.entries(input.manifestConfig ?? {})) {
      if (field.type === 'secret') {
        continue;
      }

      const explicitValue = input.config[key];
      const value = explicitValue ?? field.default;
      if (!hasMeaningfulValue(value)) {
        continue;
      }

      entries.push({
        key,
        value,
        source: explicitValue === undefined ? 'manifest_default' : 'project_config',
        mutable: false,
      });
    }

    return entries;
  }

  private buildProjectConfigDocument(input: {
    projectId: AppInstallRequest['project_id'];
    releaseId: string;
    loadedApp: LoadedAppPackage;
    configVersion: string;
    config: Record<string, unknown>;
    secretConfig: AppSecretConfigState[];
  }): AppProjectConfigDocument {
    return {
      project_id: input.projectId,
      package_id: input.loadedApp.packageId,
      release_id: input.releaseId,
      app_id: input.loadedApp.manifest.id,
      config_version: input.configVersion,
      values: Object.fromEntries(
        this.buildHandshakeConfigEntries({
          manifestConfig: input.loadedApp.manifest.config,
          config: input.config,
        }).map((entry) => [entry.key, entry.value]),
      ),
      secret_config: Object.fromEntries(
        input.secretConfig.map((entry) => [entry.key, entry]),
      ),
      updated_at: this.now(),
    };
  }

  private async rollbackInstall(input: {
    parsed: AppInstallRequest;
    loadedApp: LoadedAppPackage | null;
    storedSecrets: AppSecretConfigState[];
    runtimeSessionId?: string;
  }): Promise<void> {
    if (input.runtimeSessionId) {
      await this.options.appRuntimeService.deactivate({
        session_id: input.runtimeSessionId,
        reason: 'install rollback',
        disable_package: true,
      });
    }

    await this.options.configStore.delete(input.parsed.project_id, input.parsed.package_id);

    for (const entry of [...input.storedSecrets].reverse()) {
      await this.options.appCredentialInstallService.revokeCredential(
        input.loadedApp?.manifest.id ?? input.parsed.package_id,
        {
          key: entry.key,
          reason: 'install rollback',
        },
      );
    }

    if (input.loadedApp) {
      await this.options.runtime.removePath(input.loadedApp.rootRef);
    }
  }

  private async appendAuthorization(
    parsed: AppInstallRequest,
    manifest: LoadedAppPackage['manifest'],
    release: RegistryRelease,
  ): Promise<WitnessEvent | null> {
    if (!this.options.witnessService) {
      return null;
    }

    return this.options.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: `app-install:${parsed.project_id}:${parsed.package_id}:${release.release_id}`,
      projectId: parsed.project_id,
      actor: 'subcortex',
      status: 'approved',
      detail: {
        package_id: parsed.package_id,
        app_id: manifest.id,
        release_id: release.release_id,
        permissions_approved: parsed.permissions_approved,
      },
    });
  }

  private async appendCompletion(input: {
    parsed: AppInstallRequest;
    authorization: WitnessEvent | null;
    phase: AppInstallResult['phase'];
    status: 'succeeded' | 'failed' | 'blocked';
    detail: Record<string, unknown>;
  }): Promise<WitnessEvent | null> {
    if (!this.options.witnessService || !input.authorization) {
      return null;
    }

    return this.options.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: `app-install:${input.parsed.project_id}:${input.parsed.package_id}`,
      authorizationRef: input.authorization.id,
      projectId: input.parsed.project_id,
      actor: 'subcortex',
      status: input.status,
      detail: {
        phase: input.phase,
        ...input.detail,
      },
    });
  }
}
