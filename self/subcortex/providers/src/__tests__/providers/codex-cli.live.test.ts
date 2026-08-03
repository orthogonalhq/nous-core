import { describe, expect, it } from 'vitest';
import type {
  ModelProviderConfig,
  ProviderId,
  TraceId,
} from '@nous/shared';
import {
  CODEX_CLI_DEFAULT_MODEL_ID,
  CodexCliProvider,
  createCodexCliProcessRunner,
  resolveCodexCliExecutable,
  selectCodexCliExecutable,
} from '../../providers/codex-cli/index.js';
import type { AgentCliInvocation, AgentCliRunnerOptions } from '../../protocols/agent-cli/index.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440178' as TraceId;
const PROVIDER_ID = '10000000-0000-0000-0000-000000000004' as ProviderId;

const liveIt = process.env.NOUS_CODEX_CLI_LIVE_BT === '1' ? it : it.skip;

function createConfig(): ModelProviderConfig {
  return {
    id: PROVIDER_ID,
    name: 'Codex CLI',
    type: 'text',
    endpoint: 'http://localhost',
    modelId: CODEX_CLI_DEFAULT_MODEL_ID,
    isLocal: true,
    capabilities: ['text'],
    providerClass: 'local_text',
    vendor: 'codex-cli',
  };
}

describe('Codex CLI provider live BT', () => {
  liveIt('invokes the local Codex CLI through chat messages', async () => {
    const liveRunner = createCodexCliProcessRunner();
    const calls: Array<{ invocation: AgentCliInvocation; options?: AgentCliRunnerOptions }> = [];
    const provider = new CodexCliProvider(createConfig(), {
      executable: resolveCodexCliExecutable(selectCodexCliExecutable()),
      runner: {
        async run(invocation, options) {
          calls.push(options === undefined ? { invocation } : { invocation, options });
          return liveRunner.run(invocation, options);
        },
      },
    });

    let response;
    try {
      response = await provider.invoke({
        role: 'workers',
        input: {
          messages: [
            {
              role: 'system',
              content: 'You are a live provider smoke test. Do not inspect files. Do not run shell commands.',
            },
            {
              role: 'user',
              content: 'Reply with exactly: CODEX_PROVIDER_CHAT_OK',
            },
          ],
        },
        traceId: TRACE_ID,
      });
    } catch (error) {
      console.error('Codex live BT invocation args:', calls.map((call) => call.invocation.command.args));
      throw error;
    }

    expect(String(response.output).trim()).toBe('CODEX_PROVIDER_CHAT_OK');
  }, 180_000);

  liveIt('streams the local Codex CLI through JSONL events', async () => {
    const liveRunner = createCodexCliProcessRunner();
    const calls: Array<{ invocation: AgentCliInvocation; options?: AgentCliRunnerOptions }> = [];
    const provider = new CodexCliProvider(createConfig(), {
      executable: resolveCodexCliExecutable(selectCodexCliExecutable()),
      runner: {
        async run(invocation, options) {
          calls.push(options === undefined ? { invocation } : { invocation, options });
          return liveRunner.run(invocation, options);
        },
        stream(invocation, options) {
          calls.push(options === undefined ? { invocation } : { invocation, options });
          return liveRunner.stream!(invocation, options);
        },
      },
    });

    let streamed = '';
    try {
      for await (const chunk of provider.stream({
        role: 'workers',
        input: {
          messages: [
            {
              role: 'system',
              content: 'You are a live provider streaming smoke test. Do not inspect files. Do not run shell commands.',
            },
            {
              role: 'user',
              content: 'Reply with exactly: CODEX_PROVIDER_STREAM_OK',
            },
          ],
        },
        traceId: TRACE_ID,
      })) {
        streamed += chunk.content;
      }
    } catch (error) {
      console.error('Codex live BT stream args:', calls.map((call) => call.invocation.command.args));
      throw error;
    }

    expect(streamed.trim()).toBe('CODEX_PROVIDER_STREAM_OK');
    expect(calls[0]?.invocation.command.args).toContain('--json');
  }, 180_000);
});
