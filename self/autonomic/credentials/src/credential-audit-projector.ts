import type {
  CredentialNamespacePurgeResult,
  CredentialRevokeResult,
  CredentialStoreResult,
} from '@nous/shared';

export class CredentialAuditProjector {
  projectStore(result: CredentialStoreResult): Record<string, unknown> {
    return {
      app_id: result.metadata.app_id,
      credential_ref: result.credential_ref,
      target_host: result.metadata.target_host,
      credential_type: result.metadata.credential_type,
    };
  }

  projectRevoke(result: CredentialRevokeResult): Record<string, unknown> {
    return {
      revoked: result.revoked,
      credential_ref: result.credential_ref,
      reason: result.reason,
    };
  }

  projectPurge(result: CredentialNamespacePurgeResult): Record<string, unknown> {
    return {
      app_id: result.app_id,
      purged_count: result.purged_count,
      purged_at: result.purged_at,
    };
  }
}
