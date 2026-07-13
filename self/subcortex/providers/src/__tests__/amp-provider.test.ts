import { describe, expect, it } from 'vitest';
import { createFakeAgentCliRunner } from '../protocols/agent-cli/index.js';
import { AmpProvider } from '../providers/amp/implementation.js';
import type { ModelProviderConfig, ModelRequest } from '@nous/shared';

// NOTE: field names on ModelProviderConfig / ModelRequest are inferred from how
// provider-runtime.ts and github-copilot-cli/provider.ts construct them. If your
// actual @nous/shared types differ, adjust these two fixtures accordingly —
// everything else in this file is independent of that shape.
function makeConfig(overrides: Partial<ModelProviderConfig> = {}): ModelProviderConfig {
  return {
    id: '10000000-0000-0000-0000-000000000004',
    name: 'amp',
    type: 'text',
    modelId: 'amp',
    isLocal: true,
    capabilities: ['chat'],
    providerClass: 'local_text',
    vendor: 'amp',
    ...overrides,
  } as ModelProviderConfig;
}

function makeRequest(input: unknown, overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    input,
    traceId: 'trace-amp-test',
    ...overrides,
  } as ModelRequest;
}

describe('AmpProvider', () => {
  it('invokes amp with -x and the formatted prompt via stdin, parsing stdout on success', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'the answer is 42' }]);
    const provider = new AmpProvider(makeConfig(), { runner });

    const response = await provider.invoke(makeRequest({ prompt: 'what is the answer?' }));

    expect(response.output).toBe('the answer is 42');
    expect(response.providerId).toBe('10000000-0000-0000-0000-000000000004');
    expect(response.traceId).toBe('trace-amp-test');
    expect(response.usage.computeMs).toBeGreaterThanOrEqual(0);

    expect(runner.invocations).toHaveLength(1);
    expect(runner.invocations[0]!.command.executable).toBe('amp');
    expect(runner.invocations[0]!.command.args).toEqual(['-x']);
    expect(runner.invocations[0]!.input).toBe('what is the answer?');
  });

  it('formats system + messages into a single text prompt when no raw prompt is given', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'ok' }]);
    const provider = new AmpProvider(makeConfig(), { runner });

    await provider.invoke(makeRequest({
      system: 'You are a helpful coding agent.',
      messages: [
        { role: 'user', content: 'fix the bug' },
        { role: 'assistant', content: 'looking into it' },
      ],
    }));

    expect(runner.invocations[0]!.input).toBe(
      'You are a helpful coding agent.\n\nuser: fix the bug\nassistant: looking into it',
    );
  });

  it('rejects with PROVIDER_UNAVAILABLE and includes stderr on non-zero exit', async () => {
    const runner = createFakeAgentCliRunner([
      { exitCode: 1, stderr: 'amp: authentication required' },
    ]);
    const provider = new AmpProvider(makeConfig(), { runner });

    await expect(provider.invoke(makeRequest({ prompt: 'hi' }))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: expect.stringContaining('authentication required'),
    });
  });

  it('rejects with PROVIDER_UNAVAILABLE on timeout', async () => {
    const runner = createFakeAgentCliRunner([{ timedOut: true }]);
    const provider = new AmpProvider(makeConfig(), { runner });

    await expect(provider.invoke(makeRequest({ prompt: 'hi' }))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('rejects with PROVIDER_UNAVAILABLE on spawn error', async () => {
    const runner = createFakeAgentCliRunner([
      { error: new Error('spawn amp ENOENT') },
    ]);
    const provider = new AmpProvider(makeConfig(), { runner });

    await expect(provider.invoke(makeRequest({ prompt: 'hi' }))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: expect.stringContaining('ENOENT'),
    });
  });

  it('passes an aborted signal through to the runner when the request is already aborted', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'ok' }]);
    const provider = new AmpProvider(makeConfig(), { runner });
    const controller = new AbortController();
    controller.abort();

    await provider.invoke(makeRequest({ prompt: 'hi' }, { abortSignal: controller.signal }));

    expect(runner.calls[0]!.options?.signal?.aborted).toBe(true);
  });

  it('throws PROVIDER_UNAVAILABLE from stream() without touching the runner', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'unused' }]);
    const provider = new AmpProvider(makeConfig(), { runner });

    expect(() => provider.stream(makeRequest({ prompt: 'hi' }))).toThrow(
      /does not support streaming/,
    );
    expect(runner.invocations).toHaveLength(0);
  });

  it('rejects invalid input before ever calling the runner', async () => {
    const runner = createFakeAgentCliRunner([{ exitCode: 0, stdout: 'unused' }]);
    const provider = new AmpProvider(makeConfig(), { runner });

    await expect(provider.invoke(makeRequest({ notAValidShape: true }))).rejects.toThrow();
    expect(runner.invocations).toHaveLength(0);
  });
});