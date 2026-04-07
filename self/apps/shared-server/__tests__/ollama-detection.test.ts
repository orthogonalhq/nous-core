/**
 * Tests for the Ollama detection service.
 *
 * Uses mock HTTP responses and a mocked CLI probe so the results are
 * deterministic regardless of the machine running the tests.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

function mockExecFile(found = false): void {
  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (found) {
        callback(null, 'ollama version 0.6.0', '');
        return {} as never;
      }

      callback(Object.assign(new Error('command not found'), { code: 'ENOENT' }), '', '');
      return {} as never;
    },
  );
}

async function loadModule() {
  return import('../src/ollama-detection');
}

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
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
    mockExecFile(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns running state with models when Ollama responds with a model list', async () => {
    const { detectOllama } = await loadModule();
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
      expect(status.state).toBe('running');
      expect(status.models).toEqual(['llama3.2:3b', 'codellama:7b']);
      expect(status.defaultModel).toBe('llama3.2:3b');
    } finally {
      await stopServer(server);
    }
  });

  it('returns running state with empty models when Ollama has no models', async () => {
    const { detectOllama } = await loadModule();
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.state).toBe('running');
      expect(status.models).toEqual([]);
      expect(status.defaultModel).toBeNull();
    } finally {
      await stopServer(server);
    }
  });

  it('returns running state when Ollama responds with a non-200 status', async () => {
    const { detectOllama } = await loadModule();
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.state).toBe('running');
      expect(status.models).toEqual([]);
      expect(status.defaultModel).toBeNull();
    } finally {
      await stopServer(server);
    }
  });

  it('returns not_installed when the API is unreachable and no binary is detected', async () => {
    const { detectOllama } = await loadModule();
    const status = await detectOllama('http://127.0.0.1:1');

    expect(status.installed).toBe(false);
    expect(status.running).toBe(false);
    expect(status.state).toBe('not_installed');
    expect(status.models).toEqual([]);
    expect(status.defaultModel).toBeNull();
  });

  it('returns installed_stopped when the API is unreachable but the binary is present', async () => {
    mockExecFile(true);
    const { detectOllama } = await loadModule();
    const status = await detectOllama('http://127.0.0.1:1');

    expect(status.installed).toBe(true);
    expect(status.running).toBe(false);
    expect(status.state).toBe('installed_stopped');
    expect(status.models).toEqual([]);
    expect(status.defaultModel).toBeNull();
  });

  it('filters out entries with missing or empty names', async () => {
    const { detectOllama } = await loadModule();
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
      expect(status.state).toBe('running');
      expect(status.models).toEqual(['llama3.2:3b', 'phi3:mini']);
      expect(status.defaultModel).toBe('llama3.2:3b');
    } finally {
      await stopServer(server);
    }
  });

  it('handles missing models key in the response', async () => {
    const { detectOllama } = await loadModule();
    const { server, port } = await startMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    });

    try {
      const status = await detectOllama(`http://127.0.0.1:${port}`);
      expect(status.installed).toBe(true);
      expect(status.running).toBe(true);
      expect(status.state).toBe('running');
      expect(status.models).toEqual([]);
      expect(status.defaultModel).toBeNull();
    } finally {
      await stopServer(server);
    }
  });
});

describe('deleteOllamaModel', () => {
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
    mockExecFile(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves successfully when Ollama returns 200', async () => {
    const { deleteOllamaModel } = await loadModule();
    const { server, port } = await startMockServer((req, res) => {
      if (req.method === 'DELETE' && req.url === '/api/delete') {
        res.writeHead(200);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    try {
      await expect(
        deleteOllamaModel('llama3.2:3b', { baseUrl: `http://127.0.0.1:${port}` }),
      ).resolves.toBeUndefined();
    } finally {
      await stopServer(server);
    }
  });

  it('throws an error when Ollama returns non-200 status', async () => {
    const { deleteOllamaModel } = await loadModule();
    const { server, port } = await startMockServer((req, res) => {
      res.writeHead(404);
      res.end('model not found');
    });

    try {
      await expect(
        deleteOllamaModel('nonexistent-model', { baseUrl: `http://127.0.0.1:${port}` }),
      ).rejects.toThrow('Ollama model delete failed with HTTP 404');
    } finally {
      await stopServer(server);
    }
  });
});
