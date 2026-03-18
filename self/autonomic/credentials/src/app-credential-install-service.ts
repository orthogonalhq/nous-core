import type {
  CredentialOAuthFlowRequest,
  CredentialRevokeRequest,
  CredentialStoreRequest,
  IAppCredentialInstallService,
  ICredentialVaultService,
} from '@nous/shared';
import { CredentialOAuthBroker } from './credential-oauth-broker.js';

export interface AppCredentialInstallServiceOptions {
  vaultService: ICredentialVaultService;
  oauthBroker: CredentialOAuthBroker;
}

export class AppCredentialInstallService implements IAppCredentialInstallService {
  constructor(private readonly options: AppCredentialInstallServiceOptions) {}

  async storeSecretField(appId: string, request: CredentialStoreRequest) {
    return this.options.vaultService.store(appId, request);
  }

  async openOAuthFlow(request: CredentialOAuthFlowRequest) {
    return this.options.oauthBroker.openOAuthFlow(request);
  }

  async revokeCredential(appId: string, request: CredentialRevokeRequest) {
    return this.options.vaultService.revoke(appId, request);
  }
}
