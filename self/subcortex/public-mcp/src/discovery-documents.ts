import type {
  PublicMcpDiscoveryBundle,
  PublicMcpScope,
} from '@nous/shared';
import { PublicMcpDiscoveryBundleSchema } from '@nous/shared';

export interface PublicMcpDiscoveryDocumentsOptions {
  baseUrl: string;
  resource?: string;
  issuer?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  scopes?: readonly PublicMcpScope[];
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function buildPublicMcpDiscoveryDocuments(
  options: PublicMcpDiscoveryDocumentsOptions,
): PublicMcpDiscoveryBundle {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const issuer =
    options.issuer ?? `${baseUrl}/.well-known/oauth-authorization-server/mcp`;

  return PublicMcpDiscoveryBundleSchema.parse({
    protectedResourceMetadata: {
      resource: options.resource ?? 'urn:nous:ortho:mcp',
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      resource_documentation: `${baseUrl}/mcp`,
    },
    authorizationServerMetadata: {
      issuer,
      token_endpoint: options.tokenEndpoint ?? `${baseUrl}/oauth/token`,
      jwks_uri: options.jwksUri ?? `${baseUrl}/oauth/jwks`,
      response_types_supported: ['token'],
      grant_types_supported: ['client_credentials'],
      scopes_supported: [...(options.scopes ?? [])],
    },
  });
}
