/**
 * Tests for the Ollama detection service.
 *
 * Uses mock HTTP responses to verify detection logic without
 * requiring a real Ollama instance.
 */
import { describe, it, expect } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { detectOllama } from '../src/ollama-detection';

function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve({ server, port: addr.port });
      }
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe('detectOllama', () => {
  it('returns running=true with models when Ollama responds with model list', async () => {
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            { name: 'llama3.2:3b', size: 2000000000, digest: 'abc123' },
            { name: 'codellama:7b', size: 4000000000, digest: 'def456' },
          ],
        }),
      );
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.models).toEqual(['llama3.2:3b', 'codellama:7b']);
      expect(status.defaultModel).toBe('llama3.2:3b');
    } finally {
      await stopServer(server);
    }
  });

  it('returns running=true with empty models when Ollama has no models', async () => {
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.models).toEqual([]);
      expect(status.defaultModel).toBeNull();
    } finally {
      await stopServer(server);
    }
  });

  it('returns running=true when Ollama returns non-200 status', async () => {
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.models).toEqual([]);
      expect(status.defaultModel).toBeNull();
    } finally {
      await stopServer(server);
    }
  });

  it('returns running=false when connection is refused', async () => {
    // Use a port that nothing is listening on
    const status = await detectOllama('http://127.0.0.1:1');
    expect(status.running).toBe(false);
    expect(status.models).toEqual([]);
    expect(status.defaultModel).toBeNull();
  });

  it('filters out entries with missing or empty names', async () => {
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            { name: 'llama3.2:3b' },
            { name: '' },
            { size: 1000 },
            { name: 'phi3:mini' },
          ],
        }),
      );
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.models).toEqual(['llama3.2:3b', 'phi3:mini']);
      expect(status.defaultModel).toBe('llama3.2:3b');
    } finally {
      await stopServer(server);
    }
  });

  it('handles missing models key in response', async () => {
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.models).toEqual([]);
      expect(status.defaultModel).toBeNull();
    } finally {
      await stopServer(server);
    }
  });
});
