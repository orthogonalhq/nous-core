/**
 * SSE endpoint for the Nous event bus.
 *
 * Streams real-time events to connected clients. Supports channel
 * filtering via ?channels= query parameter (comma-separated, glob
 * prefix like "health:*").
 *
 * Uses the Node.js runtime (not edge) to support long-lived SSE
 * connections with standard HTTP streaming.
 */
import { createNousContext } from '@/server/bootstrap';
import { createEventSseHandler } from '@/server/sse';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const context = createNousContext();
  const sseHandler = createEventSseHandler(context.eventBus);

  const stream = new ReadableStream({
    start(controller) {
      // Create a mock ServerResponse-like object that writes to the ReadableStream
      const encoder = new TextEncoder();

      const mockRes = {
        _headersSent: false,
        _headers: {} as Record<string, string>,
        _closed: false,

        writeHead(_statusCode: number, headers?: Record<string, string>) {
          if (headers) {
            Object.assign(this._headers, headers);
          }
          this._headersSent = true;
        },

        flushHeaders() {
          // No-op in ReadableStream mode — headers are set on the Response object
        },

        write(chunk: string) {
          if (this._closed) return false;
          try {
            controller.enqueue(encoder.encode(chunk));
            return true;
          } catch {
            return false;
          }
        },

        on(event: string, handler: () => void) {
          if (event === 'close') {
            // Store the close handler so we can call it when the request aborts
            this._closeHandler = handler;
          }
        },

        _closeHandler: null as (() => void) | null,
      };

      // Parse the URL to pass to the SSE handler
      const url = new URL(request.url);
      const mockReq = {
        url: url.pathname + url.search,
        headers: {
          host: url.host,
        },
      };

      // Wire up request abort to trigger close cleanup
      request.signal.addEventListener('abort', () => {
        mockRes._closed = true;
        if (mockRes._closeHandler) {
          mockRes._closeHandler();
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      sseHandler(
        mockReq as unknown as IncomingMessage,
        mockRes as unknown as ServerResponse,
      );
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
