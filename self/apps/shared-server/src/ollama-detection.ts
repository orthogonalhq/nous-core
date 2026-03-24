/**
 * Ollama Detection Service — checks Ollama availability, binary resolution,
 * and model pull progress.
 *
 * Used by the desktop backend and Electron main process to report LLM
 * readiness and manage model downloads.
 */

import { execFile } from 'node:child_process';
import { z } from 'zod';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const OLLAMA_DETECTION_TIMEOUT_MS = 3000;
const OLLAMA_COMMAND_TIMEOUT_MS = 8000;

export const OllamaLifecycleStateSchema = z.enum([
  'not_installed',
  'installed_stopped',
  'starting',
  'running',
  'stopping',
  'error',
]);

export type OllamaLifecycleState = z.infer<typeof OllamaLifecycleStateSchema>;

export const OllamaStatusSchema = z.object({
  installed: z.boolean(),
  running: z.boolean(),
  state: OllamaLifecycleStateSchema,
  models: z.array(z.string()),
  defaultModel: z.string().nullable(),
  error: z.string().optional(),
});

export type OllamaStatus = z.infer<typeof OllamaStatusSchema>;

export const OllamaModelPullProgressSchema = z.object({
  status: z.string(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional(),
  percent: z.number().optional(),
});

export type OllamaModelPullProgress = z.infer<typeof OllamaModelPullProgressSchema>;

export const OllamaBinaryResolutionSchema = z.object({
  found: z.boolean(),
  command: z.string().nullable(),
  resolvedVia: z.enum(['env_override', 'path_lookup', 'platform_default']).nullable(),
  platform: z.string(),
});

export type OllamaBinaryResolution = z.infer<typeof OllamaBinaryResolutionSchema>;

export const OllamaModelPullRequestSchema = z.object({
  model: z.string().min(1),
});

const OllamaTagsResponseSchema = z.object({
  models: z
    .array(
      z.object({
        name: z.string().optional(),
      }),
    )
    .optional(),
});

const OllamaPullProgressLineSchema = z
  .object({
    status: z.string().optional(),
    digest: z.string().optional(),
    total: z.number().optional(),
    completed: z.number().optional(),
    error: z.string().optional(),
  })
  .passthrough();

function normalizeOllamaBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '');
}

function buildOllamaStatus(
  state: OllamaLifecycleState,
  options?: {
    models?: string[];
    error?: string;
  },
): OllamaStatus {
  const models = options?.models ?? [];

  return {
    installed: state !== 'not_installed',
    running: state === 'running',
    state,
    models,
    defaultModel: models[0] ?? null,
    ...(options?.error ? { error: options.error } : {}),
  };
}

function extractOllamaModels(body: unknown): string[] {
  const parsed = OllamaTagsResponseSchema.safeParse(body);

  if (!parsed.success) {
    return [];
  }

  return parsed.data.models
    ?.map((model) => model.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0) ?? [];
}

function getPlatformDefaultBinaryCandidates(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      return [];
    }

    return [`${localAppData}\\Programs\\Ollama\\ollama.exe`];
  }

  if (platform === 'darwin') {
    return ['/usr/local/bin/ollama'];
  }

  return [];
}

function probeOllamaCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      command,
      ['--version'],
      {
        timeout: OLLAMA_COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
      (error) => {
        resolve(!error);
      },
    );
  });
}

function computeProgressPercent(completed?: number, total?: number): number | undefined {
  if (typeof completed !== 'number' || typeof total !== 'number' || total <= 0) {
    return undefined;
  }

  return (completed / total) * 100;
}

async function emitPullProgressLine(
  line: string,
  onProgress?: (progress: OllamaModelPullProgress) => void,
): Promise<{ success: boolean }> {
  const parsedJson = JSON.parse(line) as unknown;
  const parsed = OllamaPullProgressLineSchema.parse(parsedJson);

  if (parsed.error) {
    onProgress?.({ status: parsed.error });
    throw new Error(parsed.error);
  }

  if (!parsed.status) {
    return { success: false };
  }

  const progress = OllamaModelPullProgressSchema.parse({
    status: parsed.status,
    digest: parsed.digest,
    total: parsed.total,
    completed: parsed.completed,
    percent: computeProgressPercent(parsed.completed, parsed.total),
  });

  onProgress?.(progress);
  return { success: parsed.status === 'success' };
}

/**
 * Resolve the Ollama CLI using env override, PATH lookup, then known platform
 * defaults.
 */
export async function resolveOllamaBinary(): Promise<OllamaBinaryResolution> {
  const platform = process.platform;
  const envOverride = process.env.OLLAMA_PATH?.trim();

  if (envOverride && (await probeOllamaCommand(envOverride))) {
    return {
      found: true,
      command: envOverride,
      resolvedVia: 'env_override',
      platform,
    };
  }

  if (await probeOllamaCommand('ollama')) {
    return {
      found: true,
      command: 'ollama',
      resolvedVia: 'path_lookup',
      platform,
    };
  }

  for (const candidate of getPlatformDefaultBinaryCandidates(platform)) {
    if (await probeOllamaCommand(candidate)) {
      return {
        found: true,
        command: candidate,
        resolvedVia: 'platform_default',
        platform,
      };
    }
  }

  return {
    found: false,
    command: null,
    resolvedVia: null,
    platform,
  };
}

/**
 * Detect Ollama availability by probing its local HTTP API and falling back to
 * binary detection when the server is unavailable.
 */
export async function detectOllama(baseUrl?: string): Promise<OllamaStatus> {
  const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);

  try {
    const response = await fetch(`${normalizedBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(OLLAMA_DETECTION_TIMEOUT_MS),
    });

    if (!response.ok) {
      return buildOllamaStatus('running');
    }

    const body = await response.json();
    const models = extractOllamaModels(body);

    return buildOllamaStatus('running', { models });
  } catch {
    const binaryResolution = await resolveOllamaBinary();

    if (binaryResolution.found) {
      return buildOllamaStatus('installed_stopped');
    }

    return buildOllamaStatus('not_installed');
  }
}

/**
 * Pull an Ollama model over the HTTP API and stream NDJSON progress updates.
 */
export async function pullOllamaModel(
  model: string,
  options?: {
    baseUrl?: string;
    signal?: AbortSignal;
    onProgress?: (progress: OllamaModelPullProgress) => void;
  },
): Promise<void> {
  options?.signal?.throwIfAborted?.();

  const request = OllamaModelPullRequestSchema.parse({ model });
  const normalizedBaseUrl = normalizeOllamaBaseUrl(options?.baseUrl);
  const response = await fetch(`${normalizedBaseUrl}/api/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: request.model,
      stream: true,
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      `Ollama model pull failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }

  if (!response.body) {
    throw new Error('Ollama model pull response did not include a body stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawSuccess = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        const result = await emitPullProgressLine(line, options?.onProgress);
        sawSuccess ||= result.success;
      }

      newlineIndex = buffer.indexOf('\n');
    }
  }

  const trailingLine = buffer.trim();
  if (trailingLine.length > 0) {
    const result = await emitPullProgressLine(trailingLine, options?.onProgress);
    sawSuccess ||= result.success;
  }

  if (!sawSuccess) {
    throw new Error(`Ollama model pull for "${request.model}" ended before reporting success.`);
  }
}
