/**
 * Unit tests for pull progress rendering in LocalModelsPage.
 *
 * Verifies:
 * - During a pull, progress bar is rendered instead of static "Pulling..." text
 * - Progress updates (percent, bytes, speed) are reflected in the UI
 * - Fallback to "Pulling..." when no SSE events arrive
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LocalModelsPage } from '../LocalModelsPage';
import type { PreferencesApi } from '../../types';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;

  constructor(_url: string) {
    MockEventSource.instances.push(this);
    this.readyState = 1; // OPEN
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // Test helper: simulate an event
  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners[type]?.forEach((l) => l(event));
  }
}

function createMockApi(overrides?: Partial<PreferencesApi>): any {
  return {
    getSystemStatus: vi.fn().mockResolvedValue({
      ollama: { running: true, models: ['llama3'] },
      configuredProviders: [],
      credentialVaultHealthy: true,
    }),
    listOllamaModels: vi.fn().mockResolvedValue({
      models: [{ name: 'llama3', size: 4_000_000_000, modifiedAt: '2024-01-01T00:00:00Z' }],
    }),
    pullOllamaModel: vi.fn().mockImplementation(() => new Promise(() => {
      // Never resolve — simulate an ongoing pull
    })),
    deleteOllamaModel: vi.fn().mockResolvedValue({ success: true }),
    getOllamaEndpoint: vi.fn().mockResolvedValue({ endpoint: 'http://localhost:11434' }),
    setOllamaEndpoint: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('LocalModelsPage pull progress', () => {
  let OriginalEventSource: typeof globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    OriginalEventSource = globalThis.EventSource;
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    globalThis.EventSource = OriginalEventSource;
    vi.restoreAllMocks();
  });

  it('shows "Pulling..." fallback when no SSE events arrive', async () => {
    const api = createMockApi();

    render(<LocalModelsPage api={api} />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('pull-model-input')).toBeDefined();
    });

    // Type model name and click pull
    const input = screen.getByTestId('pull-model-input') as HTMLInputElement;
    const pullButton = screen.getByTestId('pull-model-button');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'llama3.2' } });
    });
    await act(async () => {
      fireEvent.click(pullButton);
    });

    // Should show fallback "Downloading..." text
    await waitFor(() => {
      expect(screen.getByTestId('pull-status')).toBeDefined();
      expect(screen.getByTestId('pull-status').textContent).toBe('Downloading...');
    });
  });

  it('shows progress bar when SSE events arrive during pull', async () => {
    const api = createMockApi();

    render(<LocalModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByTestId('pull-model-input')).toBeDefined();
    });

    const input = screen.getByTestId('pull-model-input') as HTMLInputElement;
    const pullButton = screen.getByTestId('pull-model-button');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'llama3.2' } });
    });
    await act(async () => {
      fireEvent.click(pullButton);
    });

    // Get the EventSource instance created during pull
    const es = MockEventSource.instances[MockEventSource.instances.length - 1];
    expect(es).toBeDefined();

    // Simulate progress events
    await act(async () => {
      es.emit('ollama:pull-progress', {
        model: 'llama3.2',
        status: 'downloading',
        total: 4_000_000_000,
        completed: 1_000_000_000,
        percent: 25.0,
      });
    });

    // Should now show progress bar instead of "Pulling..."
    await waitFor(() => {
      const progressEl = screen.getByTestId('pull-progress');
      expect(progressEl).toBeDefined();
      expect(progressEl.textContent).toContain('25.0%');
      expect(progressEl.textContent).toContain('downloading');
    });

    // Progress bar element should exist
    expect(screen.getByTestId('pull-progress-bar')).toBeDefined();
  });

  it('updates progress display when new events arrive', async () => {
    const api = createMockApi();

    render(<LocalModelsPage api={api} />);

    await waitFor(() => {
      expect(screen.getByTestId('pull-model-input')).toBeDefined();
    });

    const input = screen.getByTestId('pull-model-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'llama3.2' } });
      fireEvent.click(screen.getByTestId('pull-model-button'));
    });

    const es = MockEventSource.instances[MockEventSource.instances.length - 1];

    // First progress event
    await act(async () => {
      es.emit('ollama:pull-progress', {
        model: 'llama3.2',
        status: 'downloading',
        total: 4_000_000_000,
        completed: 1_000_000_000,
        percent: 25.0,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('pull-progress').textContent).toContain('25.0%');
    });

    // Second progress event — higher percentage
    await act(async () => {
      es.emit('ollama:pull-progress', {
        model: 'llama3.2',
        status: 'downloading',
        total: 4_000_000_000,
        completed: 2_000_000_000,
        percent: 50.0,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('pull-progress').textContent).toContain('50.0%');
    });
  });
});
