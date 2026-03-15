import { createNousContext } from '@/server/bootstrap';

export async function GET(): Promise<Response> {
  const ctx = createNousContext();
  const bundle = await ctx.publicMcpGatewayService.getDiscoveryDocuments();
  return Response.json(bundle.authorizationServerMetadata, { status: 200 });
}
