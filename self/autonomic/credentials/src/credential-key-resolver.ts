export interface CredentialKeyResolverOptions {
  masterKey?: string;
  envKeyName?: string;
}

export class CredentialKeyResolver {
  constructor(private readonly options: CredentialKeyResolverOptions = {}) {}

  resolve(): string {
    if (this.options.masterKey) {
      return this.options.masterKey;
    }

    const envKeyName = this.options.envKeyName ?? 'NOUS_CREDENTIAL_VAULT_KEY';
    return process.env[envKeyName] ?? 'nous-dev-credential-vault-key';
  }
}
