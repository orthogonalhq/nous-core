import { z } from 'zod';
import { createNousContext } from '@/server/bootstrap';

const AppPanelRouteParamsSchema = z.object({
  appId: z.string().min(1),
  panelId: z.string().min(1),
});

const PANEL_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:";

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

async function resolveParams(
  params: Promise<{ appId: string; panelId: string }>,
): Promise<{ appId: string; panelId: string }> {
  return AppPanelRouteParamsSchema.parse(await params);
}

function buildPanelHtml(input: {
  mcpEndpoint: string;
  bundleJs: string;
}): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <style>html,body,#root{height:100%;margin:0;}body{overflow:hidden;}</style>',
    `  <script>window.__NOUS_MCP_ENDPOINT__=${JSON.stringify(input.mcpEndpoint)};</script>`,
    '</head>',
    '<body>',
    '  <div id="root"></div>',
    `  <script type="module">${escapeInlineScript(input.bundleJs)}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function buildBlockedResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ appId: string; panelId: string }>;
  },
): Promise<Response> {
  let routeParams: { appId: string; panelId: string };
  try {
    routeParams = await resolveParams(context.params);
  } catch {
    return buildBlockedResponse(400, 'Invalid app panel route parameters.');
  }

  const ctx = createNousContext();
  const panel = await ctx.appRuntimeService.resolvePanel(
    routeParams.appId,
    routeParams.panelId,
  );
  if (!panel) {
    return buildBlockedResponse(404, 'Active app panel not found.');
  }

  try {
    const transpiled = await ctx.panelTranspiler.getTranspiledPanel(panel);
    const response = new Response(
      buildPanelHtml({
        mcpEndpoint: new URL('/mcp', request.url).toString(),
        bundleJs: transpiled.entry.bundle_js,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': PANEL_CSP,
          'x-content-type-options': 'nosniff',
          'x-nous-panel-cache': transpiled.cache_status,
        },
      },
    );
    return response;
  } catch {
    return buildBlockedResponse(500, 'App panel bundle generation failed.');
  }
}
