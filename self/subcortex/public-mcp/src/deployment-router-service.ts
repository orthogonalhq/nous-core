import type {
  IPublicMcpDeploymentRouterService,
  PublicMcpDeploymentMode,
  PublicMcpDeploymentResolution,
  PublicMcpExecutionRequest,
  PublicMcpUserHandle,
} from '@nous/shared';
import { PublicMcpUserHandleSchema } from '@nous/shared';
import { HostedTenantBindingStore } from './hosted-tenant-binding-store.js';
import { TunnelSessionStore } from './tunnel-session-store.js';

export interface DeploymentRouterServiceOptions {
  hostedTenantBindingStore?: HostedTenantBindingStore;
  tunnelSessionStore?: TunnelSessionStore;
  defaultMode?: PublicMcpDeploymentMode;
  developmentHosts?: readonly string[];
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function safeParseHost(requestUrl?: string): string | null {
  if (!requestUrl) {
    return null;
  }

  try {
    return normalizeHost(new URL(requestUrl).host);
  } catch {
    return null;
  }
}

function extractUserHandle(host: string): PublicMcpUserHandle | undefined {
  const [firstLabel] = normalizeHost(host).split('.');
  const parsed = PublicMcpUserHandleSchema.safeParse(firstLabel);
  return parsed.success ? parsed.data : undefined;
}

export class DeploymentRouterService implements IPublicMcpDeploymentRouterService {
  private readonly developmentHosts: Set<string>;

  constructor(private readonly options: DeploymentRouterServiceOptions = {}) {
    this.developmentHosts = new Set(
      (options.developmentHosts ?? ['localhost:3000', '127.0.0.1:3000']).map(normalizeHost),
    );
  }

  async resolve(
    request: PublicMcpExecutionRequest,
  ): Promise<PublicMcpDeploymentResolution> {
    const requestHost = safeParseHost(request.requestUrl) ?? 'localhost:3000';

    const hostedByHost = await this.options.hostedTenantBindingStore?.getByHost(requestHost);
    if (hostedByHost?.status === 'active') {
      return {
        mode: 'hosted',
        requestHost,
        userHandle: hostedByHost.userHandle,
        bindingId: hostedByHost.bindingId,
        tenantId: hostedByHost.tenantId,
        storePrefix: hostedByHost.storePrefix,
        serverName: hostedByHost.serverName,
        phase: hostedByHost.phase,
      };
    }

    const tunnelByHost = await this.options.tunnelSessionStore?.getByHost(requestHost);
    if (tunnelByHost?.status === 'active') {
      return {
        mode: 'local_tunnel',
        requestHost,
        userHandle: tunnelByHost.userHandle,
        sessionId: tunnelByHost.sessionId,
      };
    }

    const userHandle = extractUserHandle(requestHost);
    if (userHandle) {
      const hostedByHandle =
        await this.options.hostedTenantBindingStore?.getByUserHandle(userHandle);
      if (hostedByHandle?.status === 'active') {
        return {
          mode: 'hosted',
          requestHost,
          userHandle: hostedByHandle.userHandle,
          bindingId: hostedByHandle.bindingId,
          tenantId: hostedByHandle.tenantId,
          storePrefix: hostedByHandle.storePrefix,
          serverName: hostedByHandle.serverName,
          phase: hostedByHandle.phase,
        };
      }

      const tunnelByHandle =
        await this.options.tunnelSessionStore?.getByUserHandle(userHandle);
      if (tunnelByHandle?.status === 'active') {
        return {
          mode: 'local_tunnel',
          requestHost,
          userHandle: tunnelByHandle.userHandle,
          sessionId: tunnelByHandle.sessionId,
        };
      }
    }

    if (this.developmentHosts.has(requestHost) || !request.requestUrl) {
      return {
        mode: this.options.defaultMode ?? 'development',
        requestHost,
      };
    }

    throw new Error(`No public MCP deployment resolved for host ${requestHost}`);
  }
}
