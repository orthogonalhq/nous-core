import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  PUBLIC_MCP_AUDIT_COLLECTION,
  PUBLIC_MCP_NAMESPACE_COLLECTION,
} from '@nous/subcortex-public-mcp';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { GET as getProtectedResource } from '../../app/.well-known/oauth-protected-resource/mcp/route';
import { GET as getAuthorizationServer } from '../../app/.well-known/oauth-authorization-server/mcp/route';

describe('public MCP discovery routes', () => {
  afterEach(() => {
    clearNousContextCache();
  });

  it('serves discovery documents without bootstrap or audit side effects', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-public-mcp-${randomUUID()}`);
    clearNousContextCache();

    const protectedResource = await getProtectedResource();
    const authorizationServer = await getAuthorizationServer();
    const ctx = createNousContext();

    expect(protectedResource.status).toBe(200);
    expect(authorizationServer.status).toBe(200);

    const protectedBody = await protectedResource.json();
    const authorizationBody = await authorizationServer.json();
    expect(protectedBody.resource).toBe('urn:nous:ortho:mcp');
    expect(authorizationBody.issuer).toContain('/.well-known/oauth-authorization-server/mcp');

    const namespaceRows = await ctx.documentStore.query(PUBLIC_MCP_NAMESPACE_COLLECTION, {});
    const auditRows = await ctx.documentStore.query(PUBLIC_MCP_AUDIT_COLLECTION, {});

    expect(namespaceRows).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });
});
