/**
 * AmpProvider — IModelProvider implementation for the Amp CLI coding agent.
 *
 * Spawns the `amp` CLI process, writes the formatted prompt to stdin,
 * and collects stdout as the response. Amp is a session-bound CLI agent;
 * each invoke is a discrete command execution within the session context.
 */
import { spawn } from 'node:child_process';
import { NousError, ValidationError } from '@nous/shared';
import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
} from '@nous/shared';
import { TextModelInputSchema } from '../../schemas/text-model-input.js';

const AMP_BINARY = 'amp';
const DEFAULT_TIMEOUT_MS = 120_000;

export class AmpProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly timeoutMs: number;

  constructor(
    config: ModelProviderConfig,
    options?: { timeoutMs?: number },
  ) {
    this.config = config;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getConfig(): ModelProviderConfig {
    return this.config;
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const input = this.validateInput(request.input);
    const start = Date.now();

    const prompt = this.extractPromptText(input);

    const output = await this.runCli(prompt, request.abortSignal);
    const computeMs = Date.now() - start;

    return {
      output,
      providerId: this.config.id,
      usage: { computeMs },
      traceId: request.traceId,
    };
  }

  stream(_request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    // Amp declares streaming: false — streaming is not supported.
    throw new NousError(
      'Amp CLI provider does not support streaming. Use invoke().',
      'PROVIDER_UNAVAILABLE',
    );
  }

  private validateInput(input: unknown) {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      throw new ValidationError(
        'Invalid input for AmpProvider',
        result.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      );
    }
    return result.data;
  }

  private extractPromptText(input: ReturnType<typeof TextModelInputSchema.parse>): string {
    if ('prompt' in input && typeof input.prompt === 'string') {
      return input.prompt;
    }
    if ('messages' in input && Array.isArray(input.messages)) {
      return input.messages
        .map((m) => {
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `${m.role}: ${content}`;
        })
        .join('\n');
    }
    return '';
  }

  private runCli(prompt: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(AMP_BINARY, ['-x'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      const timeoutHandle = setTimeout(() => {
        child.kill();
        reject(new NousError('Amp CLI timed out', 'PROVIDER_UNAVAILABLE'));
      }, this.timeoutMs);

      signal?.addEventListener('abort', () => {
        clearTimeout(timeoutHandle);
        child.kill();
        reject(new NousError('Amp CLI request aborted', 'ABORTED'));
      });

      child.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(
          new NousError(
            `Failed to spawn amp CLI: ${err.message}`,
            'PROVIDER_UNAVAILABLE',
          ),
        );
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
          reject(
            new NousError(
              `Amp CLI exited with code ${code}${stderr ? `: ${stderr}` : ''}`,
              'PROVIDER_UNAVAILABLE',
            ),
          );
          return;
        }
        resolve(Buffer.concat(stdoutChunks).toString('utf8'));
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}