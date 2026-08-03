import { describe, it, expect } from 'vitest';
import type { TraceId } from '@nous/shared';
import {
  providerAdapter,
  renderGhCopilotPrompt,
} from '../../providers/github-copilot-cli/adapter.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';

describe('github-copilot-cli adapter — capabilities', () => {
  it('has nativeToolUse false', () => {
    expect(providerAdapter.capabilities.nativeToolUse).toBe(false);
  });

  it('has streaming false', () => {
    expect(providerAdapter.capabilities.streaming).toBe(false);
  });

  it('has adapterKey github-copilot-cli', () => {
    expect(providerAdapter.adapterKey).toBe('github-copilot-cli');
  });

  it('has protocol agent-cli', () => {
    expect(providerAdapter.protocol).toBe(AGENT_CLI_PROTOCOL_ID);
  });
});

describe('renderGhCopilotPrompt', () => {
  it('renders a simple system prompt', () => {
    const result = renderGhCopilotPrompt('You are helpful.', [], undefined);
    expect(result).toContain('You are helpful.');
  });

  it('renders context frames with role prefix', () => {
    const result = renderGhCopilotPrompt('', [
      { role: 'user', content: 'list all processes' },
    ], undefined);
    expect(result).toContain('user: list all processes');
  });

  it('renders multiple context frames in order', () => {
    const result = renderGhCopilotPrompt('', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'help me' },
    ], undefined);
    const userIdx = result.indexOf('user: hello');
    const assistantIdx = result.indexOf('assistant: hi');
    const lastUserIdx = result.indexOf('user: help me');
    expect(userIdx).toBeLessThan(assistantIdx);
    expect(assistantIdx).toBeLessThan(lastUserIdx);
  });

  it('renders array system prompt by joining segments', () => {
    const result = renderGhCopilotPrompt(['Part one.', 'Part two.'], [], undefined);
    expect(result).toContain('Part one.');
    expect(result).toContain('Part two.');
  });

  it('renders tool definitions as text when present', () => {
    const result = renderGhCopilotPrompt('', [], [
      { name: 'run_bash', description: 'Run a shell command', inputSchema: {} as any } as any,
    ]);
    expect(result).toContain('run_bash');
  });
});

describe('providerAdapter.formatRequest', () => {
  it('returns a formatted request with prompt string', () => {
    const result = providerAdapter.create().formatRequest({
      systemPrompt: 'You are helpful.',
      context: [{ role: 'user', content: 'list all files' }],
    } as any);
    expect(typeof (result.input as Record<string, unknown>).prompt).toBe('string');
    expect((result.input as Record<string, unknown>).prompt).toContain('list all files');
  });
});

describe('providerAdapter.parseResponse', () => {
  const fakeTraceId = 'trace-001' as TraceId;

  it('returns response text from plain stdout', () => {
    const result = providerAdapter.create().parseResponse('ls -la', fakeTraceId);
    expect(result.response).toBe('ls -la');
    expect(result.contentType).toBe('text');
    expect(result.toolCalls).toEqual([]);
  });

  it('strips ANSI escape codes from stdout', () => {
    const ansiOutput = '\x1b[32mls -la\x1b[0m';
    const result = providerAdapter.create().parseResponse(ansiOutput, fakeTraceId);
    expect(result.response).toBe('ls -la');
  });

  it('returns empty response for empty stdout without throwing', () => {
    const result = providerAdapter.create().parseResponse('', fakeTraceId);
    expect(result.response).toBe('');
    expect(result.toolCalls).toEqual([]);
  });

  it('returns fallback and does not throw for null input', () => {
    expect(() => providerAdapter.create().parseResponse(null, fakeTraceId)).not.toThrow();
    const result = providerAdapter.create().parseResponse(null, fakeTraceId);
    expect(typeof result.response).toBe('string');
  });

  it('returns fallback and does not throw for object input', () => {
    expect(() => providerAdapter.create().parseResponse({ unexpected: true }, fakeTraceId)).not.toThrow();
  });

  it('returns fallback and does not throw for undefined input', () => {
    expect(() => providerAdapter.create().parseResponse(undefined, fakeTraceId)).not.toThrow();
  });
});
