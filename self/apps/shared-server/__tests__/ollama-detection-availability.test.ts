/**
 * SP 1.5 — registry-availability check tests for `checkRegistryAvailability`.
 *
 * Implements T1.1–T3.2 per the SP 1.5 SDS § 9.1 Test Plan and Implementation
 * Plan § Tests. The fetch-mock pattern matches the rest of the shared-server
 * test suite. The non-PII invariants (T1.9, T1.10) inspect the full `fetch`
 * call shape and assert against an explicit allowed-header set + denylist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTRY_AVAILABILITY_CACHE_TTL_MS,
  __resetRegistryAvailabilityCacheForTesting,
  checkRegistryAvailability,
} from '../src/ollama-detection';

const fetchMock = vi.fn();

function installFetchMock() {
  vi.stubGlobal('fetch', fetchMock);
}

function buildResponse(init: { status: number }): Response {
  // The helper only inspects `response.status`. We stub a minimal shape that
  // satisfies the helper's reads without dragging in the full Response API.
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
  } as Response;
}

describe('checkRegistryAvailability — Tier 1 contract', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetRegistryAvailabilityCacheForTesting();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('T1.1 — empty spec resolves to "unavailable" without a network call', async () => {
    const state = await checkRegistryAvailability('');
    expect(state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('T1.2 — malformed spec resolves to "unavailable" without a network call', async () => {
    const state = await checkRegistryAvailability('not-a-spec');
    expect(state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('T1.3 — unknown provider prefix resolves to "unavailable" without a network call', async () => {
    const state = await checkRegistryAvailability('unknown:model');
    expect(state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('T1.4 — 200 response resolves to "validated"', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    const state = await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(state).toBe('validated');
  });

  it('T1.5 — 404 response resolves to "unavailable"', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 404 }));
    const state = await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(state).toBe('unavailable');
  });

  it('T1.6 — AbortError resolves to "offline"', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abortError);
    const state = await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(state).toBe('offline');
  });

  it('T1.7 — 500 response resolves to "offline"', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 500 }));
    const state = await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(state).toBe('offline');
  });

  it('T1.8 — 503 response resolves to "offline"', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 503 }));
    const state = await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(state).toBe('offline');
  });

  it('T1.9 — non-PII invariant: full request shape is exactly the SDS-bound shape', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    await checkRegistryAvailability('ollama:llama3.2:3b');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // URL is exactly the canonical Ollama library page for this modelId.
    expect(url).toBe('https://ollama.com/library/llama3.2:3b');
    // Method is HEAD.
    expect(init.method).toBe('HEAD');
    // Headers contain exactly the allowed-set: Accept + User-Agent.
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).sort()).toEqual(['Accept', 'User-Agent']);
    expect(headers['Accept']).toBe('*/*');
    expect(headers['User-Agent']).toMatch(/^Nous\/[\w.-]+$/);
    // No request body.
    expect(init.body).toBeUndefined();
    // Signal is an AbortSignal (timeout-bounded) — not asserted shape, but
    // presence is the contract.
    expect(init.signal).toBeDefined();
    // No URL query string or fragment.
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
  });

  it('T1.10 — non-PII invariant: explicit denylist of disallowed substrings', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    await checkRegistryAvailability('ollama:llama3.2:3b');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const denylist = [
      'os=',
      'arch=',
      'cpu=',
      'gpu=',
      'userId=',
      'sessionId=',
      'device=',
      'Nous-',
    ];
    for (const term of denylist) {
      expect(url).not.toContain(term);
    }
    // Header keys must not contain a custom Nous-* telemetry header.
    const headers = init.headers as Record<string, string>;
    for (const key of Object.keys(headers)) {
      expect(key).not.toMatch(/^Nous-/);
    }
    // No long hash/ID-style strings in the URL (>= 32 chars not in the
    // allowed prefix).
    const longTokenRegex = /[A-Za-z0-9]{32,}/;
    const stripped = url.replace('https://ollama.com/library/', '');
    expect(stripped).not.toMatch(longTokenRegex);
  });
});

describe('checkRegistryAvailability — Tier 2 cache behaviour', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetRegistryAvailabilityCacheForTesting();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    installFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('T2.1 — second call within TTL hits the cache (fetch called once)', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    const a = await checkRegistryAvailability('ollama:llama3.2:3b');
    const b = await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(a).toBe('validated');
    expect(b).toBe('validated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('T2.2 — cache is scoped per spec (fetch called once per distinct spec)', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    await checkRegistryAvailability('ollama:llama3.2:3b');
    await checkRegistryAvailability('ollama:qwen2.5:7b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('T2.3 — reset hook clears the cache so the next call hits the network', async () => {
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    __resetRegistryAvailabilityCacheForTesting();
    await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('T2.4 — cache entry expires after TTL', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(buildResponse({ status: 200 }));
    await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REGISTRY_AVAILABILITY_CACHE_TTL_MS + 1);
    await checkRegistryAvailability('ollama:llama3.2:3b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('checkRegistryAvailability — Tier 3 edge cases', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetRegistryAvailabilityCacheForTesting();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    installFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('T3.1 — null spec resolves to "unavailable" without throwing', async () => {
    const state = await checkRegistryAvailability(null as unknown as string);
    expect(state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('T3.2 — undefined spec resolves to "unavailable" without throwing', async () => {
    const state = await checkRegistryAvailability(undefined as unknown as string);
    expect(state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
