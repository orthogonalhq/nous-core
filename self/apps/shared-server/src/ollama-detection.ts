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

// SP 1.5 — anonymous registry availability check (Decision 5,
// model-search-approach-v1). The HEAD request to the public Ollama library
// page is the canonical Stage B network call; the timeout matches the
// existing detection-call precedent.
export const REGISTRY_AVAILABILITY_TIMEOUT_MS = 3000;
// SP 1.5 — TTL for the per-spec session cache. A 30-minute window bounds
// stale-state blast radius from a single bad-answer registry response while
// keeping mount-time fan-out cheap on rapid wizard re-renders.
export const REGISTRY_AVAILABILITY_CACHE_TTL_MS = 30 * 60 * 1000;
const REGISTRY_AVAILABILITY_BASE_URL = 'https://ollama.com/library';
// Single source of truth for the Nous-version segment of the User-Agent
// header used by `checkRegistryAvailability`. Bound by SP 1.5 SDS § 5
// security posture (User-Agent is a public release marker; non-PII).
const REGISTRY_AVAILABILITY_USER_AGENT_VERSION = '0.0.0';

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

export const OllamaVersionParsedSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
});

export type OllamaVersionParsed = z.infer<typeof OllamaVersionParsedSchema>;

export const OllamaVersionResultSchema = z.object({
  raw: z.string(),
  parsed: OllamaVersionParsedSchema.nullable(),
});

export type OllamaVersionResult = z.infer<typeof OllamaVersionResultSchema>;

/**
 * Minimum Ollama version considered "known good" for native tool calling.
 *
 * Rationale (RT-5): 0.3.12 is at least 6 months old at write-time (April 2026)
 * and is the oldest version confirmed to support the native tool-calling API
 * used by the Cortex layer. Versions below this floor trigger an informational
 * warning banner in the UI; they do not block usage (bias-to-pass per D6).
 *
 * Revision policy: single source of truth — this constant lives in exactly one
 * file. Adjust upward only when a hard dependency bump is required; verify the
 * chosen value is at least 6 months old against the Ollama release history at
 * https://github.com/ollama/ollama/releases.
 */
export const MINIMUM_OLLAMA_VERSION = '0.3.12' as const;

const VERSION_REGEX = /ollama\s+version\s+v?(\d+)\.(\d+)\.(\d+)(?:[-+][\w.]+)?/i;

function parseVersionLine(stdout: string): OllamaVersionParsed | null {
  if (!stdout || typeof stdout !== 'string') {
    return null;
  }

  const match = stdout.match(VERSION_REGEX);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1] ?? '', 10);
  const minor = Number.parseInt(match[2] ?? '', 10);
  const patch = Number.parseInt(match[3] ?? '', 10);

  if (
    Number.isNaN(major) ||
    Number.isNaN(minor) ||
    Number.isNaN(patch)
  ) {
    return null;
  }

  return { major, minor, patch };
}

/**
 * Test whether a raw `ollama --version` output indicates a version at or above
 * the minimum-supported floor ({@link MINIMUM_OLLAMA_VERSION}).
 *
 * Bias-to-pass (D6): returns `true` on any input that cannot be parsed — this
 * keeps users on fringe builds (e.g., future releases, custom builds) from
 * being blocked by an unsupported-version warning. The floor check uses
 * major/minor with strict `>` semantics and `>=` on patch.
 */
export function meetsMinimumVersion(raw: string): boolean {
  const current = parseVersionLine(raw);
  if (!current) {
    return true;
  }

  const floor = parseVersionLine('ollama version ' + MINIMUM_OLLAMA_VERSION);
  if (!floor) {
    return true;
  }

  if (current.major !== floor.major) {
    return current.major > floor.major;
  }
  if (current.minor !== floor.minor) {
    return current.minor > floor.minor;
  }
  return current.patch >= floor.patch;
}

/**
 * Probe the Ollama binary for its version via `ollama --version`, returning
 * the raw stdout and a parsed triple when possible.
 *
 * Never throws (I7). All four failure modes are caught and returned as a
 * graceful fallback:
 *   1. Missing binary (`resolveOllamaBinary()` returns `found: false`)
 *   2. Command execution error (non-zero exit, ENOENT, etc.)
 *   3. Timeout
 *   4. Unparseable stdout
 */
export async function getOllamaVersion(): Promise<OllamaVersionResult> {
  try {
    const resolution = await resolveOllamaBinary();
    if (!resolution.found || !resolution.command) {
      return { raw: '', parsed: null };
    }

    const stdout = (await probeOllamaCommandWithOutput(resolution.command)).trim();
    if (!stdout) {
      return { raw: '', parsed: null };
    }

    const parsed = parseVersionLine(stdout);
    return { raw: stdout, parsed };
  } catch {
    return { raw: '', parsed: null };
  }
}

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

/**
 * Sibling of {@link probeOllamaCommand} that captures stdout instead of
 * discarding it. Used by {@link getOllamaVersion} to read `ollama --version`.
 *
 * Never throws. Resolves with the raw stdout string on exit code 0, or the
 * empty string on any error, non-zero exit, or timeout.
 */
function probeOllamaCommandWithOutput(command: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      command,
      ['--version'],
      {
        timeout: OLLAMA_COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          resolve('');
          return;
        }
        resolve(typeof stdout === 'string' ? stdout : '');
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
 * Delete an Ollama model via the HTTP API.
 */
export async function deleteOllamaModel(
  name: string,
  options?: { baseUrl?: string },
): Promise<void> {
  const normalizedBaseUrl = normalizeOllamaBaseUrl(options?.baseUrl);
  const response = await fetch(`${normalizedBaseUrl}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(OLLAMA_COMMAND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      `Ollama model delete failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
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

/**
 * Result of a single registry availability check (SP 1.5 / Decision 5).
 *
 * `'pending'` is intentionally NOT part of this enum — the helper resolves
 * synchronously into one of the three terminal states. The renderer-facing
 * `ValidationState` enum (in `hardware-detection.ts`) adds `'pending'` for
 * display purposes (default + in-flight render).
 */
export const RegistryAvailabilityStateSchema = z.enum([
  'validated',
  'unavailable',
  'offline',
]);
export type RegistryAvailabilityState = z.infer<
  typeof RegistryAvailabilityStateSchema
>;

type RegistryAvailabilityCacheEntry = {
  state: RegistryAvailabilityState;
  cachedAt: number;
};

const registryAvailabilityCache = new Map<
  string,
  RegistryAvailabilityCacheEntry
>();

function getCachedAvailability(
  modelSpec: string,
  now = Date.now(),
): RegistryAvailabilityState | null {
  const entry = registryAvailabilityCache.get(modelSpec);
  if (!entry) {
    return null;
  }
  if (now - entry.cachedAt > REGISTRY_AVAILABILITY_CACHE_TTL_MS) {
    registryAvailabilityCache.delete(modelSpec);
    return null;
  }
  return entry.state;
}

function setCachedAvailability(
  modelSpec: string,
  state: RegistryAvailabilityState,
  now = Date.now(),
): void {
  registryAvailabilityCache.set(modelSpec, { state, cachedAt: now });
}

/**
 * Test-only hook for resetting the per-spec session cache. Production code
 * MUST NOT call this — the cache is process-scoped by design (SDS § 3.4).
 */
export function __resetRegistryAvailabilityCacheForTesting(): void {
  registryAvailabilityCache.clear();
}

/**
 * Stage A — well-formedness check. Returns the bare Ollama model id when the
 * spec parses as `ollama:<modelId>`, otherwise `null`.
 *
 * Inlined (not imported from `bootstrap.ts`) to keep `ollama-detection.ts`
 * free of upward dependencies on the bootstrap module. The parsing rules
 * mirror `bootstrap.ts::parseSelectedModelSpec` for the ollama-provider arm:
 * the spec must contain a colon, the prefix must be `ollama`, and the
 * remainder (the modelId) must be non-empty.
 */
function parseOllamaModelSpec(
  spec: string | null | undefined,
): string | null {
  if (typeof spec !== 'string' || spec.length === 0) {
    return null;
  }
  const [provider, ...modelParts] = spec.split(':');
  const modelId = modelParts.join(':');
  if (provider !== 'ollama' || modelId.length === 0) {
    return null;
  }
  return modelId;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Anonymous, non-PII registry availability check for a single Ollama model
 * spec (SP 1.5 / Decision 5 — model-search-approach-v1).
 *
 * Two stages:
 *
 * 1. **Stage A — well-formedness.** Parses the spec inline. Empty,
 *    malformed, or non-ollama specs short-circuit to `'unavailable'` with
 *    no network call.
 * 2. **Stage B — anonymous HEAD probe.** Issues a HEAD request to
 *    `https://ollama.com/library/<modelId>` with a fixed allowed-header set
 *    (`Accept` set to wildcard, `User-Agent` set to `Nous/<version>`), no
 *    request body, no cookies, and a `signal: AbortSignal.timeout(...)`
 *    deadline. Maps the response per Decision 5: 2xx → `'validated'`,
 *    404 → `'unavailable'`, timeout / DNS / network / 5xx → `'offline'`.
 *
 * Results are cached per `modelSpec` for {@link
 * REGISTRY_AVAILABILITY_CACHE_TTL_MS} milliseconds. The cache is process-
 * scoped (cleared by process restart) — see SDS § 3.4 for rationale.
 *
 * Never throws.
 */
export async function checkRegistryAvailability(
  modelSpec: string,
): Promise<RegistryAvailabilityState> {
  const cached = getCachedAvailability(modelSpec);
  if (cached !== null) {
    console.info(
      `[nous:first-run] validation: ${modelSpec} -> ${cached} (cached)`,
    );
    return cached;
  }

  const modelId = parseOllamaModelSpec(modelSpec);
  if (modelId === null) {
    setCachedAvailability(modelSpec, 'unavailable');
    console.info(
      `[nous:first-run] validation: ${modelSpec} -> unavailable (fetched)`,
    );
    return 'unavailable';
  }

  const url = `${REGISTRY_AVAILABILITY_BASE_URL}/${modelId}`;
  let state: RegistryAvailabilityState;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        Accept: '*/*',
        'User-Agent': `Nous/${REGISTRY_AVAILABILITY_USER_AGENT_VERSION}`,
      },
      signal: AbortSignal.timeout(REGISTRY_AVAILABILITY_TIMEOUT_MS),
    });

    if (response.status === 404) {
      state = 'unavailable';
    } else if (response.status >= 200 && response.status < 300) {
      state = 'validated';
    } else {
      // 5xx and other unexpected statuses are treated as transient registry
      // unavailability — the user's offer is preserved (graceful degradation).
      state = 'offline';
    }
  } catch (error) {
    state = isAbortError(error) ? 'offline' : 'offline';
  }

  setCachedAvailability(modelSpec, state);
  console.info(
    `[nous:first-run] validation: ${modelSpec} -> ${state} (fetched)`,
  );
  return state;
}
