// @vitest-environment jsdom

/**
 * WR-162 SP 1.16 — RC-2 contract cap on `httpBatchLink`.
 *
 * Tier 1 contract tests + Tier 2 behavior assertion + SP 11 single-QueryClient
 * regression. The link's split semantics are tRPC v11 internal; we assert the
 * configuration-shape contract (the options literal at the call site) plus the
 * SP 11 invariants (single QueryClient, single tRPC client per mount).
 *
 * Validates:
 * - SUPV-SP1.16-001 (`maxURLLength` finite)
 * - SUPV-SP1.16-002 (`maxItems` finite)
 * - SUPV-SP1.16-003 (cap calibrated against Chromium ~8KB bound with ≥1KB headroom)
 * - SUPV-SP1.16-004 (single QueryClient + single tRPC client per TransportProvider mount)
 * - SUPV-SP1.16-005 (httpBatchLink retained — batching enabled)
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Capture httpBatchLink invocations.
const httpBatchLinkSpy = vi.fn();

vi.mock('@trpc/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@trpc/client')>();
  return {
    ...actual,
    httpBatchLink: (opts: unknown) => {
      httpBatchLinkSpy(opts);
      return actual.httpBatchLink(opts as Parameters<typeof actual.httpBatchLink>[0]);
    },
  };
});

import { TransportProvider, type TransportConfig } from '../provider';

const cfg: TransportConfig = {
  trpcUrl: 'http://localhost:9999/api/trpc',
  eventsUrl: 'http://localhost:9999/api/events',
};

beforeEach(() => {
  httpBatchLinkSpy.mockClear();
});

afterEach(() => {
  // jsdom cleanup happens via testing-library's automatic cleanup.
});

describe('TransportProvider — RC-2 batch cap contract', () => {
  it('UT-SP1.16-RC2-MAX-URL-LENGTH — configures httpBatchLink with finite maxURLLength: 7000', () => {
    render(
      <TransportProvider config={cfg}>
        <div>child</div>
      </TransportProvider>,
    );

    expect(httpBatchLinkSpy).toHaveBeenCalled();
    const opts = httpBatchLinkSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.maxURLLength).toBe(7000);
    expect(typeof opts.maxURLLength).toBe('number');
    expect(Number.isFinite(opts.maxURLLength as number)).toBe(true);
  });

  it('UT-SP1.16-RC2-MAX-ITEMS — configures httpBatchLink with finite maxItems: 1000', () => {
    render(
      <TransportProvider config={cfg}>
        <div>child</div>
      </TransportProvider>,
    );

    const opts = httpBatchLinkSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.maxItems).toBe(1000);
    expect(typeof opts.maxItems).toBe('number');
    expect(Number.isFinite(opts.maxItems as number)).toBe(true);
  });

  it('UT-SP1.16-RC2-CAP-CALIBRATION — maxURLLength is below Chromium ~8KB ceiling with ≥1KB headroom', () => {
    render(
      <TransportProvider config={cfg}>
        <div>child</div>
      </TransportProvider>,
    );

    const opts = httpBatchLinkSpy.mock.calls[0]![0] as Record<string, unknown>;
    const cap = opts.maxURLLength as number;
    // Chromium's effective binding bound for URL+headers on the request line is
    // ~8192 bytes. SDS Mechanism Choice row 2 calls for ≥1KB headroom; this
    // bound check enforces the ratified cap-value rationale.
    expect(cap).toBeGreaterThanOrEqual(6000);
    expect(cap).toBeLessThanOrEqual(7500);
  });

  it('UT-SP1.16-RC2-URL-AND-TRANSFORMER-PRESERVED — url and superjson transformer preserved in httpBatchLink options', () => {
    render(
      <TransportProvider config={cfg}>
        <div>child</div>
      </TransportProvider>,
    );

    const opts = httpBatchLinkSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.url).toBe(cfg.trpcUrl);
    expect(opts.transformer).toBeDefined();
  });

  it('UT-SP1.16-SP11-SINGLE-LINK-PER-MOUNT — httpBatchLink invoked exactly once per TransportProvider mount (single tRPC client)', () => {
    const { rerender } = render(
      <TransportProvider config={cfg}>
        <div>child</div>
      </TransportProvider>,
    );

    expect(httpBatchLinkSpy).toHaveBeenCalledTimes(1);

    // Re-render with same config: useState initializer guards the client; the
    // link factory is NOT called again. SP 11 single-QueryClient + single
    // tRPC-client invariant.
    rerender(
      <TransportProvider config={cfg}>
        <div>child-2</div>
      </TransportProvider>,
    );

    expect(httpBatchLinkSpy).toHaveBeenCalledTimes(1);
  });
});
