import {
  type CredentialOAuthFlowRequest,
  CredentialOAuthFlowResultSchema,
  type ICredentialVaultService,
} from '@nous/shared';

export type CredentialOAuthExchangeResult =
  | {
      status: 'success';
      token: string;
      grantedScopes?: string[];
      expiresAt?: string;
    }
  | {
      status: 'cancelled' | 'failed';
      reason?: string;
    };

export interface CredentialOAuthBrokerOptions {
  vaultService: ICredentialVaultService;
  exchange?: (
    request: CredentialOAuthFlowRequest,
  ) => Promise<CredentialOAuthExchangeResult>;
}

export class CredentialOAuthBroker {
  constructor(private readonly options: CredentialOAuthBrokerOptions) {}

  async openOAuthFlow(request: CredentialOAuthFlowRequest) {
    const result =
      (await this.options.exchange?.(request)) ?? {
        status: 'cancelled' as const,
        reason: 'oauth_exchange_not_configured',
      };

    if (result.status !== 'success') {
      return CredentialOAuthFlowResultSchema.parse({
        status: result.status,
        reason: result.reason,
        grantedScopes: [],
      });
    }

    const stored = await this.options.vaultService.store(request.app_id, {
      key: request.key,
      value: result.token,
      credential_type: 'oauth2',
      target_host: request.target_host,
      injection_location: request.injection_location,
      injection_key: request.injection_key,
      expires_at: result.expiresAt,
    });

    return CredentialOAuthFlowResultSchema.parse({
      status: 'success',
      credentialRef: stored.credential_ref,
      grantedScopes: result.grantedScopes ?? request.scopes,
      expiresAt: result.expiresAt,
    });
  }
}
