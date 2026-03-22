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
import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  createNousServices,
  appRouter,
  createTRPCContext,
  detectOllama,
  loadStoredApiKeys,
  loadModelSelection,
  pullOllamaModel,
  registerStoredProviders,
} from '@nous/shared-server';
import type { OllamaModelPullProgress, OllamaStatus } from '@nous/shared-server';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';

type ParentOllamaAction = 'getStatus' | 'start' | 'stop';

interface ParentOllamaResponseMessage {
  type: 'ollama:response';
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

type PendingParentRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const pullProgressEvents = new EventEmitter();
pullProgressEvents.setMaxListeners(0);

let latestPullProgress: OllamaModelPullProgress | null = null;
let activePull: Promise<void> | null = null;
let parentRequestSequence = 0;
const pendingParentRequests = new Map<string, PendingParentRequest>();

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

function defaultOllamaStatus(): OllamaStatus {
  return {
    installed: false,
    running: false,
    state: 'not_installed',
    models: [],
    defaultModel: null,
  };
}

function isParentOllamaResponseMessage(value: unknown): value is ParentOllamaResponseMessage {
  return typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'ollama:response' &&
    typeof (value as { requestId?: string }).requestId === 'string' &&
    typeof (value as { ok?: boolean }).ok === 'boolean';
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

function writeSseEvent(res: ServerResponse, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function registerParentResponseListener(): void {
  process.on('message', (message: unknown) => {
    if (!isParentOllamaResponseMessage(message)) {
      return;
    }

    const pending = pendingParentRequests.get(message.requestId);
    if (!pending) {
      return;
    }

    pendingParentRequests.delete(message.requestId);
    clearTimeout(pending.timeout);

    if (message.ok) {
      pending.resolve(message.data);
      return;
    }

    pending.reject(new Error(message.error ?? 'Parent Ollama request failed.'));
  });
}

function requestParentOllamaAction<T>(action: ParentOllamaAction): Promise<T> {
  if (!process.send) {
    return Promise.reject(new Error('Parent IPC channel is unavailable.'));
  }

  return new Promise<T>((resolve, reject) => {
    const requestId = `ollama-${Date.now()}-${++parentRequestSequence}`;
    const timeout = setTimeout(() => {
      pendingParentRequests.delete(requestId);
      reject(new Error(`Timed out waiting for parent Ollama action "${action}".`));
    }, 10_000);
    timeout.unref();

    pendingParentRequests.set(requestId, { resolve, reject, timeout });
    process.send?.({
      type: 'ollama:request',
      requestId,
      action,
    });
  });
}

async function getBestEffortOllamaStatus(): Promise<OllamaStatus> {
  try {
    return await requestParentOllamaAction<OllamaStatus>('getStatus');
  } catch {
    try {
      return await detectOllama();
    } catch {
      return defaultOllamaStatus();
    }
  }
}

function emitPullProgress(progress: OllamaModelPullProgress): void {
  latestPullProgress = progress;
  pullProgressEvents.emit('progress', progress);
}

function startModelPull(model: string): void {
  if (activePull) {
    throw new Error('An Ollama model pull is already in progress.');
  }

  latestPullProgress = { status: `Starting pull for ${model}` };
  pullProgressEvents.emit('progress', latestPullProgress);

  activePull = pullOllamaModel(model, {
    onProgress: emitPullProgress,
  })
    .then(async () => {
      console.log(`[nous:desktop-server] model pull complete: ${model}`);
      await getBestEffortOllamaStatus().catch(() => defaultOllamaStatus());
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : `Model pull failed for ${model}`;
      console.error(`[nous:desktop-server] model pull failed: ${model} — ${message}`);
      emitPullProgress({ status: message });
    })
    .finally(() => {
      activePull = null;
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`[nous:desktop-server] starting on port ${args.port}...`);
  registerParentResponseListener();

  const context = createNousServices({
    configPath: args.configPath,
    dataDir: args.dataDir,
    runtimeLabel: 'desktop',
    publicBaseUrl: `http://localhost:${args.port}`,
  });
  await loadStoredApiKeys(context);
  await registerStoredProviders(context);
  await loadModelSelection(context);

  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext: () => createTRPCContext(context),
    basePath: '/api/trpc/',
  });

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health') {
      const ollama = await getBestEffortOllamaStatus();
      writeJson(res, 200, {
        status: 'ok',
        runtime: 'desktop',
        port: args.port,
        ollama,
      });
      return;
    }

    if (req.url === '/ollama-status') {
      const ollama = await getBestEffortOllamaStatus();
      writeJson(res, 200, ollama);
      return;
    }

    if (req.url === '/ollama/start' && req.method === 'POST') {
      try {
        const result = await requestParentOllamaAction<{ success: boolean; error?: string }>('start');
        writeJson(res, 200, result);
      } catch (err) {
        writeJson(res, 503, {
          success: false,
          error: err instanceof Error ? err.message : 'Unable to start Ollama.',
        });
      }
      return;
    }

    if (req.url === '/ollama/stop' && req.method === 'POST') {
      try {
        const result = await requestParentOllamaAction<{ success: boolean; error?: string }>('stop');
        writeJson(res, 200, result);
      } catch (err) {
        writeJson(res, 503, {
          success: false,
          error: err instanceof Error ? err.message : 'Unable to stop Ollama.',
        });
      }
      return;
    }

    if (req.url === '/ollama/pull' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const model = typeof (body as { model?: unknown } | null)?.model === 'string'
          ? (body as { model: string }).model.trim()
          : '';

        if (!model) {
          writeJson(res, 400, {
            started: false,
            error: 'Request body must include a non-empty "model" string.',
          });
          return;
        }

        console.log(`[nous:desktop-server] model pull started: ${model}`);
        startModelPull(model);
        writeJson(res, 202, { started: true });
      } catch (err) {
        writeJson(res, 409, {
          started: false,
          error: err instanceof Error ? err.message : 'Unable to start model pull.',
        });
      }
      return;
    }

    if (req.url === '/ollama/pull-progress' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');

      if (latestPullProgress) {
        writeSseEvent(res, 'progress', latestPullProgress);
      }

      const onProgress = (progress: OllamaModelPullProgress) => {
        writeSseEvent(res, 'progress', progress);
      };

      pullProgressEvents.on('progress', onProgress);
      req.on('close', () => {
        pullProgressEvents.off('progress', onProgress);
      });
      return;
    }

    trpcHandler(req, res);
  });

  server.listen(args.port, '127.0.0.1', () => {
    console.log(`[nous:desktop-server] listening on http://127.0.0.1:${args.port}`);

    if (process.send) {
      process.send({ type: 'ready', port: args.port });
    }
  });

  const shutdown = () => {
    console.log('[nous:desktop-server] shutting down...');
    server.close(() => {
      console.log('[nous:desktop-server] closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('disconnect', shutdown);
}

main().catch((err) => {
  console.error('[nous:desktop-server] fatal error:', err);
  process.exit(1);
});
