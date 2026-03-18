import {
  type CredentialInjectedResponse,
  CredentialInjectedResponseSchema,
  type CredentialInjectRequest,
  type ICredentialInjector,
  type ICredentialVaultService,
} from '@nous/shared';

export interface CredentialInjectorOptions {
  vaultService: ICredentialVaultService;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

const DEFAULT_HEADERS: Record<string, string> = {
  accept: 'application/json',
};

function matchesAllowedHost(host: string, allowed: readonly string[]): boolean {
  return allowed.some((candidate) => {
    const normalized = candidate.toLowerCase();
    if (normalized === host) {
      return true;
    }
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1);
      return host.endsWith(suffix);
    }
    return false;
  });
}

function buildInjectedValue(injectionKey: string, credentialType: string, secretValue: string) {
  if (
    injectionKey.toLowerCase() === 'authorization' &&
    (credentialType === 'bearer_token' || credentialType === 'oauth2')
  ) {
    return `Bearer ${secretValue}`;
  }
  return secretValue;
}

export class CredentialInjector implements ICredentialInjector {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => string;

  constructor(private readonly options: CredentialInjectorOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async executeInjectedRequest(input: {
    appId: string;
    request: CredentialInjectRequest;
    manifestNetworkPermissions: readonly string[];
  }): Promise<CredentialInjectedResponse> {
    const resolved = await this.options.vaultService.resolveForInjection(
      input.appId,
      input.request.key,
    );
    if (!resolved) {
      throw new Error('credential_not_found');
    }

    const url = new URL(input.request.request_descriptor.url);
    const requestHost = url.host.toLowerCase();
    const targetHost = resolved.metadata.target_host.toLowerCase();
    if (
      requestHost !== targetHost ||
      !matchesAllowedHost(requestHost, input.manifestNetworkPermissions)
    ) {
      throw new Error('PKG-010-CREDENTIAL_TARGET_HOST_BLOCKED');
    }

    const injectedValue = buildInjectedValue(
      resolved.metadata.injection_key,
      resolved.metadata.credential_type,
      resolved.secretValue,
    );
    const headers = {
      ...DEFAULT_HEADERS,
      ...input.request.request_descriptor.headers,
    };
    let body = input.request.request_descriptor.body;

    if (resolved.metadata.injection_location === 'header') {
      headers[resolved.metadata.injection_key] = injectedValue;
    } else if (resolved.metadata.injection_location === 'query') {
      url.searchParams.set(resolved.metadata.injection_key, injectedValue);
    } else {
      if (typeof body === 'string') {
        throw new Error('credential_body_injection_requires_object_body');
      }
      body = {
        ...(body && !Array.isArray(body) ? body : {}),
        [resolved.metadata.injection_key]: injectedValue,
      };
    }

    const response = await this.fetchImpl(url, {
      method: input.request.request_descriptor.method,
      headers,
      body:
        body == null
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    });

    const responseHeaders = Object.fromEntries(response.headers.entries());
    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return CredentialInjectedResponseSchema.parse({
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
      credential_ref: resolved.metadata.credential_ref,
      target_host: resolved.metadata.target_host,
      executed_at: this.now(),
    });
  }
}
