import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  AppConfig,
  AppConfigField,
  AppHandshakeConfigEntry,
  AppInstallHookResult,
  AppPanelRegistrationProjection,
  AppProjectConfigDocument,
  AppSecretConfigState,
  AppSettingsPrepareRequest,
  AppSettingsPreparation,
  AppSettingsRuntimeSummary,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
  IAppCredentialInstallService,
  IAppRuntimeService,
  IAppSettingsService,
  ProjectId,
  IRuntime,
  LoadedAppPackage,
} from '@nous/shared';
import {
  AppSettingsPreparationSchema,
  AppSettingsSaveRequestSchema,
  AppSettingsSaveResultSchema,
} from '@nous/shared';
import { buildAppLaunchSpec, InstallHookRunner } from '@nous/subcortex-apps';
import { loadInstalledAppPackage } from '../package-store/index.js';
import {
  AppConfigVersionConflictError,
  DocumentAppConfigStore,
} from '../app-install/config-store.js';

export interface AppSettingsServiceOptions {
  appCredentialInstallService: IAppCredentialInstallService;
  appRuntimeService: IAppRuntimeService;
  configStore: DocumentAppConfigStore;
  installHookRunner?: InstallHookRunner;
  runtime: IRuntime;
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

function mapRuntimeSummary(
  session: Awaited<ReturnType<IAppRuntimeService['listSessions']>>[number] | null,
  fallbackConfigVersion: string,
): AppSettingsRuntimeSummary {
  if (!session) {
    return {
      status: 'inactive',
      config_version: fallbackConfigVersion,
    };
  }

  return {
    session_id: session.session_id,
    status: session.status === 'failed' ? 'failed' : session.status === 'stopped' ? 'inactive' : 'active',
    health_status: session.health_status,
    config_version: session.config_version,
  };
}

interface StagedSecretMutation {
  key: string;
  backupRef?: string;
}

export class AppSettingsService implements IAppSettingsService {
  private readonly installHookRunner: InstallHookRunner;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly instanceRoot: string;

  constructor(private readonly options: AppSettingsServiceOptions) {
    this.installHookRunner = options.installHookRunner ?? new InstallHookRunner();
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.instanceRoot = options.instanceRoot ?? process.cwd();
  }

  async prepareSettings(
    request: AppSettingsPrepareRequest,
  ): Promise<AppSettingsPreparation> {
    const currentDocument = await this.requireCurrentDocument(
      request.project_id,
      request.package_id,
    );
    const loadedApp = await this.loadInstalledApp(request.package_id);
    const runtimeSummary = await this.readRuntimeSummary(
      request.project_id,
      request.package_id,
      currentDocument.config_version,
    );

    const groups = new Map<string, AppSettingsPreparation['config_groups'][number]>();
    for (const [key, field] of Object.entries(
      loadedApp.manifest.config ?? {},
    ) as Array<[string, AppConfigField]>) {
      const groupId = field.group ?? 'general';
      const value =
        field.type === 'secret'
          ? undefined
          : currentDocument.values[key] ?? field.default;
      const valueSource: 'secret_state' | 'project_config' | 'manifest_default' =
        field.type === 'secret'
          ? 'secret_state'
          : currentDocument.values[key] !== undefined
            ? 'project_config'
            : 'manifest_default';
      const descriptor = {
        ...field,
        key,
        secret: field.type === 'secret',
        value,
        value_source: valueSource,
        secret_state:
          field.type === 'secret'
            ? currentDocument.secret_config[key] ?? {
                key,
                configured: false,
              }
            : undefined,
      };
      const currentGroup = groups.get(groupId);
      if (currentGroup) {
        currentGroup.fields.push(descriptor);
      } else {
        groups.set(groupId, {
          id: groupId,
          label: startCase(groupId),
          fields: [descriptor],
        });
      }
    }

    return AppSettingsPreparationSchema.parse({
      project_id: request.project_id,
      package_id: request.package_id,
      release_id: currentDocument.release_id,
      package_version: loadedApp.packageVersion ?? loadedApp.manifest.version,
      app_id: loadedApp.manifest.id,
      display_name: loadedApp.manifest.display_name ?? loadedApp.manifest.name,
      description: loadedApp.manifest.description,
      config_version: currentDocument.config_version,
      runtime: runtimeSummary,
      config_groups: [...groups.values()],
      panel_config_snapshot: this.buildPanelConfigSnapshot(
        loadedApp.manifest.config,
        currentDocument.values,
      ),
    });
  }

  async saveSettings(request: AppSettingsSaveRequest): Promise<AppSettingsSaveResult> {
    const parsed = AppSettingsSaveRequestSchema.parse(request);
    const currentDocument = await this.requireCurrentDocument(
      parsed.project_id,
      parsed.package_id,
    );
    const loadedApp = await this.loadInstalledApp(parsed.package_id);
    const currentRuntime = await this.selectRuntimeSession(
      parsed.project_id,
      parsed.package_id,
    );

    if (currentDocument.config_version !== parsed.expected_config_version) {
      return AppSettingsSaveResultSchema.parse({
        status: 'failed',
        apply_status: 'blocked',
        phase: 'validation',
        validation: {
          status: 'failed',
          results: [
            {
              check: 'expected-config-version-match',
              passed: false,
              retryable: true,
              message: 'The settings snapshot is stale. Refresh the canonical settings view before saving again.',
            },
          ],
        },
        effective_config_version: currentDocument.config_version,
        runtime: mapRuntimeSummary(currentRuntime, currentDocument.config_version),
        stored_secrets: Object.values(currentDocument.secret_config),
        rollback_applied: false,
        recoverable: true,
        metadata: {
          current_config_version: currentDocument.config_version,
        },
      });
    }

    const candidate = this.buildCandidateState({
      manifestConfig: loadedApp.manifest.config,
      currentDocument,
      request: parsed,
    });

    if (candidate.validation.status === 'failed') {
      return AppSettingsSaveResultSchema.parse({
        status: 'failed',
        apply_status: 'blocked',
        phase: 'validation',
        validation: candidate.validation,
        effective_config_version: currentDocument.config_version,
        runtime: mapRuntimeSummary(currentRuntime, currentDocument.config_version),
        stored_secrets: Object.values(currentDocument.secret_config),
        rollback_applied: false,
        recoverable: true,
      });
    }

    const hookValidation = await this.runValidationHook({
      loadedApp,
      projectId: parsed.project_id,
      packageId: parsed.package_id,
      values: candidate.values,
      secretConfig: candidate.secretConfig,
    });
    const mergedValidation = {
      status: hookValidation.status,
      results: [...candidate.validation.results, ...hookValidation.results],
    } as const;

    if (hookValidation.status === 'failed') {
      return AppSettingsSaveResultSchema.parse({
        status: 'failed',
        apply_status: 'blocked',
        phase: 'validation',
        validation: mergedValidation,
        effective_config_version: currentDocument.config_version,
        runtime: mapRuntimeSummary(currentRuntime, currentDocument.config_version),
        stored_secrets: Object.values(currentDocument.secret_config),
        rollback_applied: false,
        recoverable: true,
        metadata: hookValidation.metadata,
      });
    }

    const stagedMutations: StagedSecretMutation[] = [];
    const previousRuntimeWasActive =
      currentRuntime != null &&
      currentRuntime.status !== 'stopped' &&
      currentRuntime.status !== 'failed';

    try {
      await this.stageSecretMutations({
        appId: loadedApp.manifest.id,
        currentDocument,
        request: parsed,
        nextSecretConfig: candidate.secretConfig,
        stagedMutations,
      });

      if (previousRuntimeWasActive && currentRuntime) {
        await this.options.appRuntimeService.deactivate({
          session_id: currentRuntime.session_id,
          reason: 'settings apply',
          disable_package: false,
        });
      }

      const requestedConfigVersion = this.idFactory();
      const nextDocument = this.buildProjectConfigDocument({
        currentDocument,
        loadedApp,
        configVersion: requestedConfigVersion,
        values: candidate.values,
        secretConfig: Object.values(candidate.secretConfig),
      });

      await this.options.configStore.put(nextDocument, {
        expectedConfigVersion: currentDocument.config_version,
      });

      const activated = await this.options.appRuntimeService.activate(
        this.buildActivationInput({
          projectId: parsed.project_id,
          loadedApp,
          releaseId: currentDocument.release_id,
          configVersion: requestedConfigVersion,
          values: candidate.values,
          secretConfig: Object.values(candidate.secretConfig),
        }),
      );

      await this.discardSecretBackups(loadedApp.manifest.id, stagedMutations);

      return AppSettingsSaveResultSchema.parse({
        status: 'success',
        apply_status: 'applied',
        phase: 'completed',
        validation: mergedValidation,
        requested_config_version: requestedConfigVersion,
        effective_config_version: requestedConfigVersion,
        runtime: mapRuntimeSummary(activated, requestedConfigVersion),
        stored_secrets: Object.values(candidate.secretConfig),
        rollback_applied: false,
        recoverable: true,
        metadata: hookValidation.metadata,
      });
    } catch (error) {
      const recovered = await this.recoverPreviousTruth({
        appId: loadedApp.manifest.id,
        currentDocument,
        currentRuntime,
        previousRuntimeWasActive,
        loadedApp,
        projectId: parsed.project_id,
        stagedMutations,
      });

      if (recovered) {
        return AppSettingsSaveResultSchema.parse({
          status: 'partial',
          apply_status: 'reverted',
          phase: 'recovery',
          validation: mergedValidation,
          effective_config_version: currentDocument.config_version,
          runtime: recovered,
          stored_secrets: Object.values(currentDocument.secret_config),
          activation_failure: {
            code:
              error instanceof AppConfigVersionConflictError
                ? 'APP-SETTINGS-CONFIG-VERSION-CONFLICT'
                : 'APP-SETTINGS-ACTIVATION-FAILED',
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
          rollback_applied: true,
          recoverable: true,
        });
      }

      return AppSettingsSaveResultSchema.parse({
        status: 'failed',
        apply_status: 'blocked',
        phase: 'recovery',
        validation: mergedValidation,
        effective_config_version: currentDocument.config_version,
        runtime: {
          status: 'failed',
          config_version: currentDocument.config_version,
        },
        stored_secrets: Object.values(currentDocument.secret_config),
        activation_failure: {
          code: 'APP-SETTINGS-RECOVERY-BLOCKED',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
        rollback_applied: true,
        recoverable: true,
      });
    }
  }

  private async requireCurrentDocument(
    projectId: AppSettingsPrepareRequest['project_id'],
    packageId: string,
  ): Promise<AppProjectConfigDocument> {
    const current = await this.options.configStore.get(projectId, packageId);
    if (!current) {
      throw new Error(`App settings are unavailable for ${packageId} in project ${projectId}.`);
    }
    return current;
  }

  private async loadInstalledApp(packageId: string): Promise<LoadedAppPackage> {
    return loadInstalledAppPackage({
      instanceRoot: this.instanceRoot,
      runtime: this.options.runtime,
      packageId,
    });
  }

  private async selectRuntimeSession(
    projectId: ProjectId,
    packageId: string,
  ) {
    const sessions = await this.options.appRuntimeService.listSessions(packageId);
    const matching = sessions.filter((session) => session.project_id === projectId);
    return (
      matching.find((session) => session.status === 'active') ??
      matching.find((session) => session.status === 'starting') ??
      matching.find((session) => session.status === 'draining') ??
      matching[0] ??
      null
    );
  }

  private async readRuntimeSummary(
    projectId: ProjectId,
    packageId: string,
    fallbackConfigVersion: string,
  ): Promise<AppSettingsRuntimeSummary> {
    const session = await this.selectRuntimeSession(projectId, packageId);
    return mapRuntimeSummary(session, fallbackConfigVersion);
  }

  private buildCandidateState(input: {
    manifestConfig?: AppConfig;
    currentDocument: AppProjectConfigDocument;
    request: AppSettingsSaveRequest;
  }): {
    values: Record<string, unknown>;
    secretConfig: Record<string, AppSecretConfigState>;
    validation: AppSettingsSaveResult['validation'];
  } {
    const values: Record<string, unknown> = {};
    const secretConfig: Record<string, AppSecretConfigState> = {
      ...input.currentDocument.secret_config,
    };
    const results: AppSettingsSaveResult['validation']['results'] = [];

    for (const [key, field] of Object.entries(input.manifestConfig ?? {})) {
      if (field.type === 'secret') {
        const mutation = input.request.secrets[key];
        const currentSecret = input.currentDocument.secret_config[key];
        const operation = mutation?.operation ?? 'retain';
        if (operation === 'clear') {
          secretConfig[key] = {
            key,
            configured: false,
            source: currentSecret?.source ?? 'secret_field',
            provider: currentSecret?.provider,
          };
        } else if (operation === 'replace') {
          secretConfig[key] = {
            key,
            configured: true,
            source: currentSecret?.source ?? 'secret_field',
            provider: currentSecret?.provider,
          };
        } else if (currentSecret) {
          secretConfig[key] = currentSecret;
        }

        const configured = secretConfig[key]?.configured === true;
        if (field.required && !configured) {
          results.push({
            field: key,
            check: 'required-secret-present',
            passed: false,
            retryable: true,
            message: `${field.label ?? startCase(key)} is required.`,
          });
        }
        continue;
      }

      const explicitValue =
        input.request.config[key] !== undefined
          ? input.request.config[key]
          : input.currentDocument.values[key];
      const resolvedValue = explicitValue ?? field.default;
      if (hasMeaningfulValue(resolvedValue)) {
        values[key] = resolvedValue;
      }

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
      values,
      secretConfig,
      validation: {
        status: results.some((entry) => !entry.passed) ? 'failed' : 'success',
        results,
      },
    };
  }

  private async runValidationHook(input: {
    loadedApp: LoadedAppPackage;
    projectId: ProjectId;
    packageId: string;
    values: Record<string, unknown>;
    secretConfig: Record<string, AppSecretConfigState>;
  }): Promise<AppInstallHookResult> {
    return this.installHookRunner.runOnInstall({
      hook_ref: input.loadedApp.manifest.lifecycle?.onInstall
        ? join(input.loadedApp.rootRef, input.loadedApp.manifest.lifecycle.onInstall)
        : undefined,
      payload: {
        app_id: input.loadedApp.manifest.id,
        package_id: input.packageId,
        project_id: input.projectId,
        config: this.resolveConfigWithSentinels({
          manifestConfig: input.loadedApp.manifest.config,
          values: input.values,
          secretConfig: input.secretConfig,
        }),
        secret_config: input.secretConfig,
      },
    });
  }

  private async stageSecretMutations(input: {
    appId: string;
    currentDocument: AppProjectConfigDocument;
    request: AppSettingsSaveRequest;
    nextSecretConfig: Record<string, AppSecretConfigState>;
    stagedMutations: StagedSecretMutation[];
  }): Promise<void> {
    for (const [key, mutation] of Object.entries(
      input.request.secrets,
    ) as Array<[string, AppSettingsSaveRequest['secrets'][string]]>) {
      if (!mutation || mutation.operation === 'retain') {
        continue;
      }

      const backup = await this.options.appCredentialInstallService.backupCredential(
        input.appId,
        key,
      );
      input.stagedMutations.push({
        key,
        backupRef: backup.backup_ref,
      });

      if (mutation.operation === 'replace') {
        const currentState = input.currentDocument.secret_config[key];
        const stored = await this.options.appCredentialInstallService.storeSecretField(
          input.appId,
          {
            key,
            value: mutation.value!,
            credential_type: currentState?.source === 'oauth' ? 'oauth2' : 'custom',
            target_host: currentState?.provider ?? 'settings-config',
            injection_location: 'body',
            injection_key: key,
          },
        );
        input.nextSecretConfig[key] = {
          key,
          configured: true,
          credential_ref: stored.credential_ref,
          source: currentState?.source ?? 'secret_field',
          provider: currentState?.provider,
        };
        continue;
      }

      await this.options.appCredentialInstallService.revokeCredential(input.appId, {
        key,
        reason: 'settings clear',
      });
      input.nextSecretConfig[key] = {
        key,
        configured: false,
        source: input.currentDocument.secret_config[key]?.source ?? 'secret_field',
        provider: input.currentDocument.secret_config[key]?.provider,
      };
    }
  }

  private async discardSecretBackups(
    appId: string,
    stagedMutations: readonly StagedSecretMutation[],
  ): Promise<void> {
    for (const mutation of stagedMutations) {
      if (!mutation.backupRef) {
        continue;
      }
      await this.options.appCredentialInstallService.discardCredentialBackup(
        appId,
        mutation.backupRef,
      );
    }
  }

  private async recoverPreviousTruth(input: {
    appId: string;
    currentDocument: AppProjectConfigDocument;
    currentRuntime: Awaited<ReturnType<AppSettingsService['selectRuntimeSession']>>;
    previousRuntimeWasActive: boolean;
    loadedApp: LoadedAppPackage;
    projectId: ProjectId;
    stagedMutations: readonly StagedSecretMutation[];
  }): Promise<AppSettingsRuntimeSummary | null> {
    try {
      await this.options.configStore.put(input.currentDocument);
      for (const mutation of [...input.stagedMutations].reverse()) {
        if (!mutation.backupRef) {
          continue;
        }
        await this.options.appCredentialInstallService.restoreCredential(
          input.appId,
          mutation.backupRef,
        );
        await this.options.appCredentialInstallService.discardCredentialBackup(
          input.appId,
          mutation.backupRef,
        );
      }

      if (input.previousRuntimeWasActive) {
        const restored = await this.options.appRuntimeService.activate(
          this.buildActivationInput({
            projectId: input.projectId,
            loadedApp: input.loadedApp,
            releaseId: input.currentDocument.release_id,
            configVersion: input.currentDocument.config_version,
            values: input.currentDocument.values,
            secretConfig: Object.values(input.currentDocument.secret_config),
          }),
        );
        return mapRuntimeSummary(restored, input.currentDocument.config_version);
      }

      return {
        status: 'inactive',
        config_version: input.currentDocument.config_version,
      };
    } catch {
      return null;
    }
  }

  private resolveConfigWithSentinels(input: {
    manifestConfig?: AppConfig;
    values: Record<string, unknown>;
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

      const value = input.values[key] ?? field.default;
      if (hasMeaningfulValue(value)) {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private buildActivationInput(input: {
    projectId: ProjectId;
    loadedApp: LoadedAppPackage;
    releaseId: string;
    configVersion: string;
    values: Record<string, unknown>;
    secretConfig: AppSecretConfigState[];
  }) {
    const resolvedConfigEntries = this.buildHandshakeConfigEntries({
      manifestConfig: input.loadedApp.manifest.config,
      values: input.values,
    });
    const secretConfig = Object.fromEntries(
      input.secretConfig.map((entry) => [entry.key, entry]),
    );
    const appDataDir = this.options.runtime.resolvePath(
      this.options.runtime.getDataDir(),
      'apps',
      sanitizePackageId(input.loadedApp.packageId),
    );
    const panels: AppPanelRegistrationProjection[] = (input.loadedApp.manifest.panels ?? []).map(
      (panel: LoadedAppPackage['manifest']['panels'][number]) => ({
        app_id: input.loadedApp.manifest.id,
        session_id: 'settings-surface',
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
        packageVersion: input.loadedApp.packageVersion ?? input.loadedApp.manifest.version,
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
    values: Record<string, unknown>;
  }): AppHandshakeConfigEntry[] {
    const entries: AppHandshakeConfigEntry[] = [];

    for (const [key, field] of Object.entries(input.manifestConfig ?? {})) {
      if (field.type === 'secret') {
        continue;
      }
      const explicitValue = input.values[key];
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
    currentDocument: AppProjectConfigDocument;
    loadedApp: LoadedAppPackage;
    configVersion: string;
    values: Record<string, unknown>;
    secretConfig: AppSecretConfigState[];
  }): AppProjectConfigDocument {
    return {
      project_id: input.currentDocument.project_id,
      package_id: input.currentDocument.package_id,
      release_id: input.currentDocument.release_id,
      app_id: input.loadedApp.manifest.id,
      config_version: input.configVersion,
      values: input.values,
      secret_config: Object.fromEntries(
        input.secretConfig.map((entry) => [entry.key, entry]),
      ),
      updated_at: this.now(),
    };
  }

  private buildPanelConfigSnapshot(
    manifestConfig: AppConfig | undefined,
    values: Record<string, unknown>,
  ) {
    const snapshot: Record<
      string,
      { value: unknown; source: AppHandshakeConfigEntry['source'] }
    > = {};

    for (const entry of this.buildHandshakeConfigEntries({
      manifestConfig,
      values,
    })) {
      snapshot[entry.key] = {
        value: entry.value,
        source: entry.source,
      };
    }

    return snapshot;
  }
}
