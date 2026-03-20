import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  type CredentialBackupResult,
  CredentialBackupResultSchema,
  type CredentialDiscardBackupResult,
  CredentialDiscardBackupResultSchema,
  type CredentialMetadata,
  type CredentialNamespacePurgeResult,
  CredentialMetadataSchema,
  type CredentialRevokeRequest,
  CredentialRevokeResultSchema,
  type CredentialRestoreResult,
  CredentialRestoreResultSchema,
  type CredentialStoreRequest,
  CredentialStoreResultSchema,
  type CredentialVaultEntry,
  CredentialVaultEntrySchema,
  type ICredentialVaultService,
  type IDocumentStore,
} from '@nous/shared';
import { CredentialKeyResolver, type CredentialKeyResolverOptions } from './credential-key-resolver.js';

export const CREDENTIAL_VAULT_COLLECTION = 'credential_vault_entries';
export const CREDENTIAL_NAMESPACE_COLLECTION = 'credential_vault_namespaces';
export const CREDENTIAL_BACKUP_COLLECTION = 'credential_vault_backups';

interface CredentialNamespaceRecord {
  app_id: string;
  keys: string[];
}

interface CredentialBackupRecord {
  backup_ref: string;
  app_id: string;
  user_key: string;
  entry: CredentialVaultEntry | null;
  created_at: string;
}

export interface CredentialVaultServiceOptions {
  documentStore?: IDocumentStore;
  keyResolver?: CredentialKeyResolver;
  keyResolverOptions?: CredentialKeyResolverOptions;
  now?: () => string;
}

export class CredentialVaultService implements ICredentialVaultService {
  private readonly now: () => string;
  private readonly keyResolver: CredentialKeyResolver;
  private readonly inMemoryEntries = new Map<string, CredentialVaultEntry>();
  private readonly inMemoryNamespaces = new Map<string, CredentialNamespaceRecord>();
  private readonly inMemoryBackups = new Map<string, CredentialBackupRecord>();

  constructor(private readonly options: CredentialVaultServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.keyResolver =
      options.keyResolver ?? new CredentialKeyResolver(options.keyResolverOptions);
  }

  async store(
    appId: string,
    request: CredentialStoreRequest,
  ) {
    const now = this.now();
    const vaultKey = this.buildVaultKey(appId, request.key);
    const credentialRef = `credential:${vaultKey}`;
    const encrypted = this.encrypt(request.value);
    const entry = CredentialVaultEntrySchema.parse({
      app_id: appId,
      user_key: request.key,
      credential_ref: credentialRef,
      credential_type: request.credential_type,
      target_host: request.target_host,
      injection_location: request.injection_location,
      injection_key: request.injection_key,
      expires_at: request.expires_at,
      created_at: now,
      updated_at: now,
      vault_key: vaultKey,
      encrypted_value: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
    });

    await this.putEntry(entry);
    await this.addNamespaceKey(appId, request.key);

    return CredentialStoreResultSchema.parse({
      credential_ref: credentialRef,
      metadata: this.toMetadata(entry),
    });
  }

  async getMetadata(appId: string, key: string): Promise<CredentialMetadata | null> {
    const entry = await this.getEntry(this.buildVaultKey(appId, key));
    return entry ? this.toMetadata(entry) : null;
  }

  async revoke(appId: string, request: CredentialRevokeRequest) {
    const vaultKey = this.buildVaultKey(appId, request.key);
    const entry = await this.getEntry(vaultKey);
    if (!entry) {
      return CredentialRevokeResultSchema.parse({
        revoked: false,
        reason: request.reason ?? 'credential_not_found',
      });
    }

    await this.deleteEntry(vaultKey);
    await this.removeNamespaceKey(appId, request.key);

    return CredentialRevokeResultSchema.parse({
      revoked: true,
      credential_ref: entry.credential_ref,
      reason: request.reason,
    });
  }

  async backup(appId: string, key: string): Promise<CredentialBackupResult> {
    const backupRef = `backup:${appId}:${key}:${this.now()}:${randomBytes(4).toString('hex')}`;
    const entry = await this.getEntry(this.buildVaultKey(appId, key));
    const record: CredentialBackupRecord = {
      backup_ref: backupRef,
      app_id: appId,
      user_key: key,
      entry,
      created_at: this.now(),
    };

    await this.putBackup(record);

    return CredentialBackupResultSchema.parse({
      backup_ref: backupRef,
      existed: Boolean(entry),
      metadata: entry ? this.toMetadata(entry) : undefined,
    });
  }

  async restore(appId: string, backupRef: string): Promise<CredentialRestoreResult> {
    const backup = await this.getBackup(backupRef);
    if (!backup || backup.app_id !== appId) {
      return CredentialRestoreResultSchema.parse({
        restored: false,
      });
    }

    if (backup.entry) {
      await this.putEntry(backup.entry);
      await this.addNamespaceKey(appId, backup.entry.user_key);
      return CredentialRestoreResultSchema.parse({
        restored: true,
        metadata: this.toMetadata(backup.entry),
      });
    }

    await this.deleteEntry(this.buildVaultKey(appId, backup.user_key));
    await this.removeNamespaceKey(appId, backup.user_key);
    return CredentialRestoreResultSchema.parse({
      restored: true,
    });
  }

  async discardBackup(
    appId: string,
    backupRef: string,
  ): Promise<CredentialDiscardBackupResult> {
    const backup = await this.getBackup(backupRef);
    if (!backup || backup.app_id !== appId) {
      return CredentialDiscardBackupResultSchema.parse({
        discarded: false,
      });
    }

    await this.deleteBackup(backupRef);
    return CredentialDiscardBackupResultSchema.parse({
      discarded: true,
    });
  }

  async purgeNamespace(appId: string): Promise<CredentialNamespacePurgeResult> {
    const namespace = await this.getNamespace(appId);
    let purgedCount = 0;

    for (const key of namespace.keys) {
      const vaultKey = this.buildVaultKey(appId, key);
      const existing = await this.getEntry(vaultKey);
      if (!existing) {
        continue;
      }
      await this.deleteEntry(vaultKey);
      purgedCount += 1;
    }

    await this.putNamespace({
      app_id: appId,
      keys: [],
    });

    return {
      app_id: appId,
      purged_count: purgedCount,
      purged_at: this.now(),
    };
  }

  async resolveForInjection(appId: string, key: string) {
    const entry = await this.getEntry(this.buildVaultKey(appId, key));
    if (!entry) {
      return null;
    }

    return {
      metadata: this.toMetadata(entry),
      secretValue: this.decrypt(entry),
    };
  }

  private buildVaultKey(appId: string, key: string): string {
    return `${appId}:${key}`;
  }

  private toMetadata(entry: CredentialVaultEntry): CredentialMetadata {
    return CredentialMetadataSchema.parse({
      app_id: entry.app_id,
      user_key: entry.user_key,
      credential_ref: entry.credential_ref,
      credential_type: entry.credential_type,
      target_host: entry.target_host,
      injection_location: entry.injection_location,
      injection_key: entry.injection_key,
      expires_at: entry.expires_at,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    });
  }

  private encrypt(value: string) {
    const key = createHash('sha256').update(this.keyResolver.resolve()).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private decrypt(entry: CredentialVaultEntry): string {
    const key = createHash('sha256').update(this.keyResolver.resolve()).digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(entry.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(entry.auth_tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(entry.encrypted_value, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  private async putEntry(entry: CredentialVaultEntry): Promise<void> {
    if (this.options.documentStore) {
      await this.options.documentStore.put(
        CREDENTIAL_VAULT_COLLECTION,
        entry.vault_key,
        entry,
      );
      return;
    }
    this.inMemoryEntries.set(entry.vault_key, entry);
  }

  private async getEntry(vaultKey: string): Promise<CredentialVaultEntry | null> {
    const entry = this.options.documentStore
      ? await this.options.documentStore.get<CredentialVaultEntry>(
          CREDENTIAL_VAULT_COLLECTION,
          vaultKey,
        )
      : this.inMemoryEntries.get(vaultKey) ?? null;

    return entry ? CredentialVaultEntrySchema.parse(entry) : null;
  }

  private async deleteEntry(vaultKey: string): Promise<void> {
    if (this.options.documentStore) {
      await this.options.documentStore.delete(CREDENTIAL_VAULT_COLLECTION, vaultKey);
      return;
    }
    this.inMemoryEntries.delete(vaultKey);
  }

  private async getNamespace(appId: string): Promise<CredentialNamespaceRecord> {
    const record = this.options.documentStore
      ? await this.options.documentStore.get<CredentialNamespaceRecord>(
          CREDENTIAL_NAMESPACE_COLLECTION,
          appId,
        )
      : this.inMemoryNamespaces.get(appId) ?? null;

    return record ?? {
      app_id: appId,
      keys: [],
    };
  }

  private async putNamespace(record: CredentialNamespaceRecord): Promise<void> {
    if (this.options.documentStore) {
      await this.options.documentStore.put(
        CREDENTIAL_NAMESPACE_COLLECTION,
        record.app_id,
        record,
      );
      return;
    }
    this.inMemoryNamespaces.set(record.app_id, record);
  }

  private async addNamespaceKey(appId: string, key: string): Promise<void> {
    const record = await this.getNamespace(appId);
    if (!record.keys.includes(key)) {
      record.keys.push(key);
    }
    await this.putNamespace(record);
  }

  private async removeNamespaceKey(appId: string, key: string): Promise<void> {
    const record = await this.getNamespace(appId);
    await this.putNamespace({
      app_id: appId,
      keys: record.keys.filter((candidate) => candidate !== key),
    });
  }

  private async putBackup(record: CredentialBackupRecord): Promise<void> {
    if (this.options.documentStore) {
      await this.options.documentStore.put(
        CREDENTIAL_BACKUP_COLLECTION,
        record.backup_ref,
        record,
      );
      return;
    }
    this.inMemoryBackups.set(record.backup_ref, record);
  }

  private async getBackup(backupRef: string): Promise<CredentialBackupRecord | null> {
    if (this.options.documentStore) {
      return (
        await this.options.documentStore.get<CredentialBackupRecord>(
          CREDENTIAL_BACKUP_COLLECTION,
          backupRef,
        )
      ) ?? null;
    }

    return this.inMemoryBackups.get(backupRef) ?? null;
  }

  private async deleteBackup(backupRef: string): Promise<void> {
    if (this.options.documentStore) {
      await this.options.documentStore.delete(CREDENTIAL_BACKUP_COLLECTION, backupRef);
      return;
    }
    this.inMemoryBackups.delete(backupRef);
  }
}
