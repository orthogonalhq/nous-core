import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderId, TraceId } from '@nous/shared';
import { LaneAwareProvider } from '@nous/subcortex-inference-runtime';
import {
  ADAPTER_MODULES,
  ADAPTER_RESOLVER,
  AnthropicProvider,
  ChatCompletionsProvider,
  CERTIFIED_PROVIDER_FACTORIES,
  CodexCliProvider,
  GeminiProvider,
  GitHubCopilotCliProvider,
  MistralProvider,
  OllamaProvider,
  OpenClawProvider,
  QwenCodeProvider,
  PROVIDER_DEFINITIONS,
  ProviderRegistry,
  buildAdapterResolver,
  createFakeAgentCliRunner,
  defineProvider,
  defineProviderAdapter,
  resolveProviderDefinition,
  textAdapter,
} from '../index.js';
import {
  GITHUB_COPILOT_CLI_PROVIDER_DEFINITION,
  createGhProcessRunner,
} from '../providers/github-copilot-cli/index.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440000' as TraceId;

function createEmptyConfig() {
  return {
    get: () => ({ providers: [] }),
    getSection: () => undefined,
    update: async () => undefined,
    reload: async () => undefined,
  } as any;
}

function configFromDefinition(definition: (typeof PROVIDER_DEFINITIONS)[number]) {
  return {
    id: definition.wellKnownProviderId,
    name: definition.vendorKey,
    type: definition.providerType,
    endpoint: definition.defaultEndpoint,
    modelId: definition.defaultModelId,
    isLocal: definition.isLocal,
    capabilities: ['chat', 'streaming'],
    providerClass: definition.providerClass,
    vendor: definition.vendorKey,
  };
}

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPINFRA_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.HUGGINGFACE_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.VLLM_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
});

describe('provider definition to adapter to registry pipeline', () => {
  it('aggregates all production provider definitions by vendor key', () => {
    expect(PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey)).toEqual([
      'anthropic',
      'azure-openai',
      'codex-cli',
      'deepinfra',
      'gemini',
      'github-copilot-cli',
      'groq',
      'huggingface-tgi',
      'llama-cpp',
      'mistral',
      'moonshot',
      'ollama',
      'openai',
      'openclaw',
      'openrouter',
      'perplexity',
      'qwen-code',
      'vllm',
      'xai'
    ]);
    expect(resolveProviderDefinition('anthropic').defaultModelId).toBe(
      'claude-sonnet-4-20250514',
    );
    expect(resolveProviderDefinition('openai').adapterKey).toBe('chat-completions');
    expect(resolveProviderDefinition('moonshot').adapterKey).toBe('chat-completions');
    expect(resolveProviderDefinition('ollama').auth.required).toBe(false);
    expect(resolveProviderDefinition('huggingface-tgi').adapterKey).toBe('chat-completions');
  });

  it('makes a leaf provider definition discoverable through typed aggregation', () => {
    const fixtureDefinition = defineProvider({
      vendorKey: 'fixture',
      displayName: 'Fixture',
      wellKnownProviderId: '20000000-0000-0000-0000-000000000001' as ProviderId,
      providerType: 'text',
      providerClass: 'remote_text',
      protocol: 'fixture-chat',
      adapterKey: 'fixture-chat',
      defaultEndpoint: 'https://fixture.example.com',
      defaultModelId: 'fixture-1',
      auth: {
        envVar: 'FIXTURE_API_KEY',
        vaultKeyNamespace: 'fixture',
        required: true,
        purpose: 'api_key',
      },
      isLocal: false,
    });

    const localDefinitions = [...PROVIDER_DEFINITIONS, fixtureDefinition] as const;

    expect(localDefinitions.find((definition) => definition.vendorKey === 'fixture')).toBe(
      fixtureDefinition,
    );
  });

  it('resolves every provider definition adapter key to a module with the module-object contract', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      const module = ADAPTER_RESOLVER.resolveModule(definition.adapterKey);

      expect(module.adapterKey).toBe(definition.adapterKey);
      expect(module.displayName.length).toBeGreaterThan(0);
      expect(module.protocol.length).toBeGreaterThan(0);
      expect(module.capabilities).toEqual(
        expect.objectContaining({
          nativeToolUse: expect.any(Boolean),
          cacheControl: expect.any(Boolean),
          extendedThinking: expect.any(Boolean),
          streaming: expect.any(Boolean),
        }),
      );
      expect(typeof module.create).toBe('function');
    }
  });

  it('parses representative response shapes for each production provider adapter', () => {
    const cases = [
      {
        adapterKey: 'anthropic',
        output: { content: [{ type: 'text', text: 'Anthropic response' }] },
        expected: 'Anthropic response',
      },
      {
        adapterKey: 'chat-completions',
        output: { choices: [{ message: { content: 'Chat response' } }] },
        expected: 'Chat response',
      },
      {
        adapterKey: 'chat-completions',
        output: { choices: [{ message: { content: 'DeepInfra response' } }] },
        expected: 'DeepInfra response',
      },
      {
        adapterKey: 'codex-cli',
        output: 'Codex CLI response',
        expected: 'Codex CLI response',
      },
      {
        adapterKey: 'ollama',
        output: { content: 'Ollama response' },
        expected: 'Ollama response',
      },
    ];

    for (const testCase of cases) {
      const adapter = ADAPTER_RESOLVER.resolveAdapter(testCase.adapterKey);
      const parsed = adapter.parseResponse(testCase.output, TRACE_ID);

      expect(parsed.response).toBe(testCase.expected);
      expect(parsed.toolCalls).toEqual([]);
      expect(parsed.contentType).toBe('text');
    }
  });

  it('keeps adapter parsing no-throw with text fallback for malformed outputs', () => {
    for (const module of ADAPTER_MODULES) {
      const adapter = ADAPTER_RESOLVER.resolveAdapter(module.adapterKey);

      expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
      expect(adapter.parseResponse({ unexpected: true }, TRACE_ID).contentType).toBe('text');
    }
  });

  it('constructs providers from registry-derived definitions with env-var credentials', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.AZURE_OPENAI_API_KEY = 'test-azure-openai-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.DEEPINFRA_API_KEY = 'test-deepinfra-key';
    process.env.HUGGINGFACE_API_KEY = 'test-huggingface-key';
    process.env.MOONSHOT_API_KEY = 'test-moonshot-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.PERPLEXITY_API_KEY = 'test-perplexity-key';

    const registry = new ProviderRegistry(createEmptyConfig());
    const expectedClassByVendor = {
      anthropic: AnthropicProvider,
      'azure-openai': ChatCompletionsProvider,
      'codex-cli': CodexCliProvider,
      'github-copilot-cli': GitHubCopilotCliProvider,
      moonshot: ChatCompletionsProvider,
      'llama-cpp': ChatCompletionsProvider,
      'deepinfra': ChatCompletionsProvider,
      gemini: GeminiProvider,
      openai: ChatCompletionsProvider,
      groq: ChatCompletionsProvider,
      mistral: MistralProvider,
      ollama: OllamaProvider,
      'qwen-code': QwenCodeProvider,
      'huggingface-tgi': ChatCompletionsProvider,
      openclaw: OpenClawProvider,
      openrouter: ChatCompletionsProvider,
      perplexity: ChatCompletionsProvider,
      vllm: ChatCompletionsProvider,
      xai: ChatCompletionsProvider,
    };

    for (const definition of PROVIDER_DEFINITIONS) {
      registry.registerProvider(configFromDefinition(definition));
      const provider = registry.getProvider(definition.wellKnownProviderId) as any;

      expect(provider).toBeInstanceOf(LaneAwareProvider);
      expect(provider.inner).toBeInstanceOf(expectedClassByVendor[definition.vendorKey]);
      expect(provider.getConfig().vendor).toBe(definition.vendorKey);
    }
  });

  it('aggregates provider factories in the same vendor order as definitions', () => {
    expect(CERTIFIED_PROVIDER_FACTORIES.map((factory) => factory.vendorKey)).toEqual(
      PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey),
    );
  });

  it('skips auth-required providers without matching env vars and keeps Ollama credential-free', () => {
    const registry = new ProviderRegistry({
      get: () => ({
        providers: PROVIDER_DEFINITIONS.map(configFromDefinition),
      }),
      getSection: () => undefined,
      update: async () => undefined,
      reload: async () => undefined,
    } as any);

    expect(registry.getProvider(resolveProviderDefinition('anthropic').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('azure-openai').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('deepinfra').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('codex-cli').wellKnownProviderId)).toBeInstanceOf(
      LaneAwareProvider,
    );
    expect(registry.getProvider(resolveProviderDefinition('openai').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('moonshot').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('openrouter').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('perplexity').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('huggingface-tgi').wellKnownProviderId)).toBeInstanceOf(
      LaneAwareProvider,
    );
    expect(registry.getProvider(resolveProviderDefinition('vllm').wellKnownProviderId)).toBeInstanceOf(
      LaneAwareProvider,
    );
    expect(registry.getProvider(resolveProviderDefinition('ollama').wellKnownProviderId)).toBeInstanceOf(
      LaneAwareProvider,
    );
  });

  it('supports a mock leaf adapter through typed adapter aggregation', () => {
    const fixtureAdapter = defineProviderAdapter({
      adapterKey: 'fixture-chat',
      displayName: 'Fixture Chat',
      protocol: 'fixture-chat',
      capabilities: {
        nativeToolUse: false,
        cacheControl: false,
        extendedThinking: false,
        streaming: false,
      },
      create() {
        return {
          capabilities: this.capabilities,
          formatRequest(input) {
            return { input: { prompt: input.systemPrompt } };
          },
          parseResponse(output) {
            return {
              response: String(output ?? ''),
              toolCalls: [],
              memoryCandidates: [],
              contentType: 'text',
            };
          },
        };
      },
    });

    const resolver = buildAdapterResolver([...ADAPTER_MODULES, fixtureAdapter] as const);

    expect(resolver.resolveModule('fixture-chat')).toBe(fixtureAdapter);
    expect(resolver.resolveAdapter('fixture-chat').parseResponse('ok', TRACE_ID).response).toBe(
      'ok',
    );
    expect(resolver.resolveAdapter('missing').capabilities).toEqual(textAdapter.capabilities);
  });
});


describe('github-copilot-cli — role compatibility', () => {
  it('declares session_bound_command profile', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.executionCapabilityProfile).toBe(
      'session_bound_command',
    );
  });

  it('is not persistent_process (cannot be assigned to Cortex Chat/System)', () => {
    expect(GITHUB_COPILOT_CLI_PROVIDER_DEFINITION.executionCapabilityProfile).not.toBe(
      'persistent_process',
    );
  });
});

describe('github-copilot-cli — fake runner invocation', () => {
  it('returns parsed output on successful run', async () => {
    const fakeRunner = createFakeAgentCliRunner([
      { exitCode: 0, stdout: 'ls -la', stderr: '' },
    ]);
    const config = configFromDefinition(resolveProviderDefinition('github-copilot-cli') as any);
    const provider = new GitHubCopilotCliProvider(config as any, { runner: fakeRunner });
    const response = await provider.invoke({
      role: 'workers',
      input: { prompt: 'How do I list files?' },
      traceId: TRACE_ID,
    } as any);
    expect(response.output).toBe('ls -la');

    const call = fakeRunner.calls[0];
    expect(call.invocation.command.args).toEqual(['models', 'run', 'openai/gpt-4o-mini']);
    // Prompt is delivered via stdin, never through argv.
    expect(call.invocation.input).toBe('How do I list files?');
    expect(call.invocation.command.args).not.toContain('How do I list files?');
  });

  it('throws on non-zero exit', async () => {
    const fakeRunner = createFakeAgentCliRunner([
      { exitCode: 1, stdout: '', stderr: 'error: authentication required' },
    ]);
    const config = configFromDefinition(resolveProviderDefinition('github-copilot-cli') as any);
    const provider = new GitHubCopilotCliProvider(config as any, { runner: fakeRunner });
    await expect(
      provider.invoke({
        role: 'workers',
        input: { prompt: 'list files' },
        traceId: TRACE_ID,
      } as any),
    ).rejects.toThrow('[github-copilot-cli]');
  });

  it('throws on timeout', async () => {
    const fakeRunner = createFakeAgentCliRunner([
      { timedOut: true },
    ]);
    const config = configFromDefinition(resolveProviderDefinition('github-copilot-cli') as any);
    const provider = new GitHubCopilotCliProvider(config as any, { runner: fakeRunner });
    await expect(
      provider.invoke({
        role: 'workers',
        input: { prompt: 'list files' },
        traceId: TRACE_ID,
      } as any),
    ).rejects.toThrow('[github-copilot-cli]');
  });
});

describe('github-copilot-cli — process runner', () => {
  it('honors environmentPolicy allowlist (does not leak unrelated parent env)', async () => {
    const runner = createGhProcessRunner({
      baseEnv: {
        ...process.env,
        NOUS_GH_ALLOWED: 'ok',
        NOUS_GH_SECRET: 'should-not-leak',
      },
    });
    const result = await runner.run(
      {
        command: {
          executable: process.execPath,
          args: [
            '-e',
            'process.stdout.write(JSON.stringify({ allowed: process.env.NOUS_GH_ALLOWED ?? null, secret: process.env.NOUS_GH_SECRET ?? null }))',
          ],
        },
        timeoutMs: 15_000,
      },
      {
        environmentPolicy: {
          mergeStrategy: 'allowlist',
          allowlist: ['NOUS_GH_ALLOWED', 'PATH', 'PATHEXT', 'SystemRoot'],
        },
      },
    );
    expect(result.ok).toBe(true);
    const env = JSON.parse(result.stdout) as { allowed: string | null; secret: string | null };
    expect(env.allowed).toBe('ok');
    expect(env.secret).toBeNull();
  });

  it('inherits the full parent environment when no policy is provided', async () => {
    const runner = createGhProcessRunner({
      baseEnv: { ...process.env, NOUS_GH_INHERITED: 'yes' },
    });
    const result = await runner.run(
      {
        command: {
          executable: process.execPath,
          args: ['-e', 'process.stdout.write(process.env.NOUS_GH_INHERITED ?? "MISSING")'],
        },
        timeoutMs: 15_000,
      },
      undefined,
    );
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('yes');
  });

  it('inherits nothing from the parent env under mergeStrategy "none" (policy + invocation only)', async () => {
    const runner = createGhProcessRunner({
      baseEnv: { ...process.env, NOUS_GH_SECRET: 'should-not-leak' },
    });
    const policyEnv: Record<string, string> = { NOUS_GH_POLICY: 'from-policy' };
    // Provide just enough for node to start without inheriting the parent env.
    if (process.env.PATH) policyEnv.PATH = process.env.PATH;
    if (process.env.SystemRoot) policyEnv.SystemRoot = process.env.SystemRoot;
    const result = await runner.run(
      {
        command: {
          executable: process.execPath,
          args: [
            '-e',
            'process.stdout.write(JSON.stringify({ policy: process.env.NOUS_GH_POLICY ?? null, secret: process.env.NOUS_GH_SECRET ?? null }))',
          ],
        },
        timeoutMs: 15_000,
      },
      { environmentPolicy: { mergeStrategy: 'none', env: policyEnv } },
    );
    expect(result.ok).toBe(true);
    const env = JSON.parse(result.stdout) as { policy: string | null; secret: string | null };
    expect(env.policy).toBe('from-policy');
    expect(env.secret).toBeNull();
  });

  it('delivers the prompt via stdin (not argv)', async () => {
    const runner = createGhProcessRunner();
    const result = await runner.run(
      {
        command: {
          executable: process.execPath,
          args: ['-e', 'process.stdin.pipe(process.stdout)'],
        },
        input: 'piped-prompt-content',
        timeoutMs: 15_000,
      },
      undefined,
    );
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('piped-prompt-content');
  });

  it('aborts before spawn when the signal is already aborted (no process is spawned)', async () => {
    const runner = createGhProcessRunner();
    const result = await runner.run(
      {
        command: {
          executable: process.execPath,
          // If this ever spawned, stdout would be 'should-not-run'.
          args: ['-e', 'process.stdout.write("should-not-run")'],
        },
        timeoutMs: 5_000,
      },
      { signal: { aborted: true } },
    );
    expect(result.ok).toBe(false);
    expect(result.stdout).toBe('');
    // This exact message is only produced by the pre-spawn abort branch, proving the
    // child process was never spawned.
    expect(result.failure?.message).toBe('Agent CLI invocation aborted before start.');
  });

  it('force-resolves a timed-out run even when the child ignores SIGTERM (never hangs the lane)', async () => {
    // The child ignores SIGTERM, so a SIGTERM-only timeout would hang forever.
    // The runner must escalate to SIGKILL and resolve the run as a timeout.
    const runner = createGhProcessRunner({ sigtermGraceMs: 200 });
    const result = await runner.run(
      {
        command: {
          executable: process.execPath,
          args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'],
        },
        timeoutMs: 200,
      },
      undefined,
    );
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('timeout');
  });
});
