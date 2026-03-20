/**
 * Desktop Backend Server — standalone tRPC server for the Electron app.
 *
 * Spawned as a child process by the Electron main process. Communicates
 * readiness and port via IPC (process.send). Uses the same shared bootstrap
 * as the web app but without Next.js — bare http.createServer + tRPC
 * standalone adapter.
 *
 * Usage: node server/main.ts --port=<port> [--data-dir=<path>]
 */
import { createServer } from 'node:http';
import { createNousServices, appRouter, createTRPCContext, detectOllama } from '@nous/shared-server';
import type { OllamaStatus } from '@nous/shared-server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';

// ─── Parse CLI arguments ────────────────────────────────────────────────────

function parseArgs(argv: string[]): { port: number; dataDir?: string; configPath?: string } {
  let port = 0;
  let dataDir: string | undefined;
  let configPath: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--port=')) {
      port = parseInt(arg.slice('--port='.length), 10);
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice('--data-dir='.length);
    } else if (arg.startsWith('--config-path=')) {
      configPath = arg.slice('--config-path='.length);
    }
  }

  if (!port || isNaN(port)) {
    console.error('[nous:desktop-server] --port=<number> is required');
    process.exit(1);
  }

  return { port, dataDir, configPath };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`[nous:desktop-server] starting on port ${args.port}...`);

  // Create the full Nous service graph
  const context = createNousServices({
    configPath: args.configPath,
    dataDir: args.dataDir,
    runtimeLabel: 'desktop',
    publicBaseUrl: `http://localhost:${args.port}`,
  });

  // Create tRPC HTTP handler with basePath matching the web app's endpoint
  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext: () => createTRPCContext(context),
    basePath: '/api/trpc/',
  });

  // Create bare HTTP server with CORS support for the renderer
  const server = createServer((req, res) => {
    // CORS headers — renderer runs on a different origin in dev mode
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint — includes Ollama status for renderer awareness
    if (req.url === '/health') {
      detectOllama().then((ollama) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', runtime: 'desktop', port: args.port, ollama }));
      }).catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok', runtime: 'desktop', port: args.port,
          ollama: { installed: false, running: false, models: [], defaultModel: null } satisfies OllamaStatus,
        }));
      });
      return;
    }

    // Dedicated Ollama status endpoint for polling
    if (req.url === '/ollama-status') {
      detectOllama().then((ollama) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ollama));
      }).catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ installed: false, running: false, models: [], defaultModel: null } satisfies OllamaStatus));
      });
      return;
    }

    // Route tRPC requests
    trpcHandler(req, res);
  });

  server.listen(args.port, '127.0.0.1', () => {
    console.log(`[nous:desktop-server] listening on http://127.0.0.1:${args.port}`);

    // Signal readiness to the parent Electron main process
    if (process.send) {
      process.send({ type: 'ready', port: args.port });
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[nous:desktop-server] shutting down...');
    server.close(() => {
      console.log('[nous:desktop-server] closed');
      process.exit(0);
    });
    // Force exit after 5 seconds if graceful shutdown hangs
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Parent process disconnect — Electron closed
  process.on('disconnect', shutdown);
}

main().catch((err) => {
  console.error('[nous:desktop-server] fatal error:', err);
  process.exit(1);
});
