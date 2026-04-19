/**
 * Hardware detection and model recommendation helpers for the desktop first-run flow.
 */
import { execFile } from 'node:child_process';
import * as os from 'node:os';
import { ModelRoleSchema } from '@nous/shared';
import { z } from 'zod';
const GPU_COMMAND_TIMEOUT_MS = 4000;
const GPU_COMMAND_MAX_BUFFER = 1024 * 1024;

export const GpuInfoSchema = z.object({
  detected: z.boolean(),
  name: z.string().optional(),
  vramMB: z.number().int().nonnegative().optional(),
});

export type GpuInfo = z.infer<typeof GpuInfoSchema>;

export const HardwareSpecSchema = z.object({
  totalMemoryMB: z.number().int().nonnegative(),
  availableMemoryMB: z.number().int().nonnegative(),
  cpuCores: z.number().int().nonnegative(),
  cpuModel: z.string(),
  platform: z.string(),
  arch: z.string(),
  gpu: GpuInfoSchema,
});

export type HardwareSpec = z.infer<typeof HardwareSpecSchema>;

/**
 * Validation state for a single recommended model spec, surfaced through the
 * first-run wizard's recommendation card and custom-spec input. Added in
 * SP 1.5 per Decision 5 (model-search-approach-v1, runtime availability check).
 *
 * - `'validated'` — the spec was confirmed available on the Ollama registry.
 * - `'pending'` — the validation has not yet completed (or not yet started).
 * - `'unavailable'` — the spec parsed but the registry returned 404 (or the
 *   spec is malformed and Stage A short-circuited without a network call).
 * - `'offline'` — the registry could not be reached (timeout, DNS failure,
 *   network error, or 5xx). The card stays selectable; the user is informed
 *   that availability could not be verified.
 */
export const ValidationStateSchema = z.enum([
  'validated',
  'pending',
  'unavailable',
  'offline',
]);

export type ValidationState = z.infer<typeof ValidationStateSchema>;

export const ModelRecommendationSchema = z.object({
  modelId: z.string(),
  modelSpec: z.string(),
  displayName: z.string(),
  ramRequiredMB: z.number().int().nonnegative(),
  reason: z.string(),
  validationState: ValidationStateSchema.default('pending'),
});

export type ModelRecommendation = z.infer<typeof ModelRecommendationSchema>;

export const RoleModelRecommendationSchema = z.object({
  role: ModelRoleSchema,
  recommendation: ModelRecommendationSchema,
});

export type RoleModelRecommendation = z.infer<typeof RoleModelRecommendationSchema>;

export const RecommendationResultSchema = z.object({
  singleModel: ModelRecommendationSchema.nullable(),
  multiModel: z.array(RoleModelRecommendationSchema),
  hardwareSpec: HardwareSpecSchema,
  profileName: z.string(),
  advisory: z.string(),
});

export type RecommendationResult = z.infer<typeof RecommendationResultSchema>;

export type RecommendationProfilePolicy = {
  name?: string;
  allowLocalProviders?: boolean;
  allowRemoteProviders?: boolean;
};

type RecommendationTier = 'tiny' | 'small' | 'medium' | 'large';

/**
 * Curated Ollama-library catalog used by `recommendModels` to seed the
 * first-run wizard's model recommendations.
 *
 * Catalog refresh policy (SP 1.5 / Decision 5 — model-search-approach-v1):
 *   - Catalog identifiers are source-controlled; no admin UI for runtime edits
 *     (Goals Constraint 14, SDS I14).
 *   - Each entry's `validationState` defaults to `'pending'` via the schema;
 *     the runtime availability check (`checkRegistryAvailability`) populates
 *     the validation map served alongside the recommendation by
 *     `firstRun.checkPrerequisites`.
 *   - Identifiers verified against the Ollama library at SP 1.5 ship
 *     (April 2026). The four below remain currently published and continue
 *     to receive long-term release support; they are the canonical SP 1.5
 *     baseline. If a future tier needs a newer identifier, refresh by direct
 *     edit and bump the verification date in this comment.
 */
const LOCAL_MODEL_CATALOG: Record<RecommendationTier, ModelRecommendation> = {
  tiny: {
    modelId: 'llama3.2:3b',
    modelSpec: 'ollama:llama3.2:3b',
    displayName: 'Llama 3.2 3B',
    ramRequiredMB: 4096,
    reason: 'Best fit for low-memory systems and first-run downloads.',
    validationState: 'pending',
  },
  small: {
    modelId: 'qwen2.5:7b',
    modelSpec: 'ollama:qwen2.5:7b',
    displayName: 'Qwen 2.5 7B',
    ramRequiredMB: 8192,
    reason: 'Balanced local model for everyday desktop orchestration and chat.',
    validationState: 'pending',
  },
  medium: {
    modelId: 'qwen2.5:14b',
    modelSpec: 'ollama:qwen2.5:14b',
    displayName: 'Qwen 2.5 14B',
    ramRequiredMB: 16384,
    reason: 'Mid-spec recommendation for stronger reasoning with manageable local requirements.',
    validationState: 'pending',
  },
  large: {
    modelId: 'qwen2.5:32b',
    modelSpec: 'ollama:qwen2.5:32b',
    displayName: 'Qwen 2.5 32B',
    ramRequiredMB: 32768,
    reason: 'High-spec recommendation for local-first advanced reasoning.',
    validationState: 'pending',
  },
};

const REMOTE_SINGLE_MODEL: ModelRecommendation = {
  modelId: 'claude-sonnet-4-20250514',
  modelSpec: 'anthropic:claude-sonnet-4-20250514',
  displayName: 'Claude Sonnet 4',
  ramRequiredMB: 0,
  reason: 'Remote-first fallback when the active profile does not allow local providers.',
  validationState: 'pending',
};

const REMOTE_REASONER_MODEL: ModelRecommendation = {
  modelId: 'claude-opus-4-20250514',
  modelSpec: 'anthropic:claude-opus-4-20250514',
  displayName: 'Claude Opus 4',
  ramRequiredMB: 0,
  reason: 'Higher-capability remote reasoner recommendation for remote-only profiles.',
  validationState: 'pending',
};

const REMOTE_SUPPORT_MODEL: ModelRecommendation = {
  modelId: 'gpt-4o',
  modelSpec: 'openai:gpt-4o',
  displayName: 'GPT-4o',
  ramRequiredMB: 0,
  reason: 'General-purpose remote support model for assistant, tool, and vision roles.',
  validationState: 'pending',
};

function bytesToMegabytes(bytes: number): number {
  return Math.max(0, Math.round(bytes / (1024 * 1024)));
}

function buildUnknownGpu(): GpuInfo {
  return { detected: false };
}

function createRecommendation(
  recommendation: ModelRecommendation,
  reason: string,
): ModelRecommendation {
  return {
    ...recommendation,
    reason,
  };
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: GPU_COMMAND_TIMEOUT_MS,
        maxBuffer: GPU_COMMAND_MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(`${stdout ?? ''}`.trim());
      },
    );
  });
}

function parseNvidiaSmiOutput(output: string): GpuInfo {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);

  if (!line) {
    return buildUnknownGpu();
  }

  const [namePart, vramPart] = line.split(',').map((entry) => entry?.trim());
  const vramMB = Number.parseInt(vramPart ?? '', 10);

  return GpuInfoSchema.parse({
    detected: true,
    name: namePart || undefined,
    ...(Number.isFinite(vramMB) ? { vramMB } : {}),
  });
}

function parseWmicOutput(output: string): GpuInfo {
  const nameMatch = output.match(/^Name=(.+)$/m);
  const adapterRamMatch = output.match(/^AdapterRAM=(\d+)$/m);
  const adapterRamBytes = adapterRamMatch
    ? Number.parseInt(adapterRamMatch[1] ?? '', 10)
    : Number.NaN;

  return GpuInfoSchema.parse({
    detected: !!nameMatch,
    ...(nameMatch?.[1]?.trim() ? { name: nameMatch[1].trim() } : {}),
    ...(Number.isFinite(adapterRamBytes)
      ? { vramMB: bytesToMegabytes(adapterRamBytes) }
      : {}),
  });
}

function parseSystemProfilerOutput(output: string): GpuInfo {
  const nameMatch =
    output.match(/Chipset Model:\s+(.+)$/m) ??
    output.match(/Model:\s+(.+)$/m);
  const vramMatch =
    output.match(/VRAM \(?:Dynamic, Max|Total\):\s+([0-9.]+)\s*(GB|MB)/im) ??
    output.match(/VRAM:\s+([0-9.]+)\s*(GB|MB)/im);

  let vramMB: number | undefined;
  if (vramMatch) {
    const amount = Number.parseFloat(vramMatch[1] ?? '');
    const unit = (vramMatch[2] ?? 'MB').toUpperCase();
    if (Number.isFinite(amount)) {
      vramMB = unit === 'GB'
        ? Math.round(amount * 1024)
        : Math.round(amount);
    }
  }

  return GpuInfoSchema.parse({
    detected: !!nameMatch,
    ...(nameMatch?.[1]?.trim() ? { name: nameMatch[1].trim() } : {}),
    ...(typeof vramMB === 'number' ? { vramMB } : {}),
  });
}

async function detectGpu(): Promise<GpuInfo> {
  const platform = os.platform();

  try {
    if (platform === 'win32' || platform === 'linux') {
      try {
        return parseNvidiaSmiOutput(
          await runCommand('nvidia-smi', [
            '--query-gpu=name,memory.total',
            '--format=csv,noheader,nounits',
          ]),
        );
      } catch (error) {
        if (platform === 'linux') {
          throw error;
        }
      }

      return parseWmicOutput(
        await runCommand('wmic', [
          'path',
          'win32_VideoController',
          'get',
          'name,AdapterRAM',
          '/format:list',
        ]),
      );
    }

    if (platform === 'darwin') {
      return parseSystemProfilerOutput(
        await runCommand('system_profiler', ['SPDisplaysDataType']),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[nous:hardware] GPU detection failed: ${message}`);
  }

  return buildUnknownGpu();
}

function resolveRecommendationTier(spec: HardwareSpec): RecommendationTier {
  const totalMemoryMB = spec.totalMemoryMB;
  const gpuVramMB = spec.gpu.vramMB ?? 0;

  if (totalMemoryMB >= 32768 || gpuVramMB >= 16384) {
    return 'large';
  }

  if (totalMemoryMB >= 16384 || gpuVramMB >= 8192) {
    return 'medium';
  }

  if (totalMemoryMB >= 8192) {
    return 'small';
  }

  return 'tiny';
}

function buildLocalRecommendations(
  spec: HardwareSpec,
  tier: RecommendationTier,
): RecommendationResult {
  const singleModel = createRecommendation(
    LOCAL_MODEL_CATALOG[tier],
    `${LOCAL_MODEL_CATALOG[tier].displayName} fits the detected RAM tier for this local-first profile.`,
  );

  const multiModel: RoleModelRecommendation[] =
    tier === 'medium'
      ? [
          {
            role: 'cortex-chat',
            recommendation: createRecommendation(
              LOCAL_MODEL_CATALOG.medium,
              'Use the stronger local model for reasoning-heavy work.',
            ),
          },
          {
            role: 'orchestrators',
            recommendation: createRecommendation(
              LOCAL_MODEL_CATALOG.small,
              'Keep orchestration responsive with a lighter local model.',
            ),
          },
        ]
      : tier === 'large'
        ? [
            {
              role: 'cortex-chat',
              recommendation: createRecommendation(
                LOCAL_MODEL_CATALOG.large,
                'High-spec hardware can sustain a larger local reasoner.',
              ),
            },
            {
              role: 'orchestrators',
              recommendation: createRecommendation(
                LOCAL_MODEL_CATALOG.medium,
                'Use a mid-tier model for orchestration to preserve local responsiveness.',
              ),
            },
          ]
        : [];

  const advisory =
    tier === 'tiny'
      ? 'Detected a low-memory system. Start with a compact Ollama model and scale up later if needed.'
      : tier === 'small'
        ? 'Detected an entry-to-mid desktop profile. A single local model is the safest first-run default.'
        : tier === 'medium'
          ? 'Detected a mid-spec desktop profile. You can run one solid local default or split roles across lighter models.'
          : 'Detected a high-spec desktop profile. Larger local reasoning models and split-role layouts are viable.';

  console.info(
    `[nous:hardware] Recommendation: ${singleModel.modelId} for profile local-first`,
  );

  return RecommendationResultSchema.parse({
    singleModel,
    multiModel,
    hardwareSpec: spec,
    profileName: 'local-first',
    advisory,
  });
}

function buildRemoteRecommendations(spec: HardwareSpec): RecommendationResult {
  console.info(
    `[nous:hardware] Recommendation: ${REMOTE_SINGLE_MODEL.modelId} for profile remote-first`,
  );

  return RecommendationResultSchema.parse({
    singleModel: REMOTE_SINGLE_MODEL,
    multiModel: [
      {
        role: 'cortex-chat',
        recommendation: REMOTE_REASONER_MODEL,
      },
    ],
    hardwareSpec: spec,
    profileName: 'remote-first',
    advisory:
      'The active profile does not allow local providers, so the recommendation surface is remote-only.',
  });
}

/**
 * Detect the current machine hardware using Node.js OS primitives plus
 * best-effort GPU probing.
 */
export async function detectHardware(): Promise<HardwareSpec> {
  const cpuInfo = os.cpus();
  const spec = HardwareSpecSchema.parse({
    totalMemoryMB: bytesToMegabytes(os.totalmem()),
    availableMemoryMB: bytesToMegabytes(os.freemem()),
    cpuCores: cpuInfo.length,
    cpuModel: cpuInfo[0]?.model?.trim() || 'Unknown CPU',
    platform: os.platform(),
    arch: os.arch(),
    gpu: await detectGpu(),
  });

  console.info(
    `[nous:hardware] Detected: ${spec.totalMemoryMB}MB RAM, ${spec.cpuCores} cores, GPU: ${spec.gpu.detected}`,
  );

  return spec;
}

/**
 * Recommend a first-run model layout from the detected hardware and current profile policy.
 */
export function recommendModels(
  spec: HardwareSpec,
  profile: RecommendationProfilePolicy = {
    name: 'local-only',
    allowLocalProviders: true,
    allowRemoteProviders: false,
  },
): RecommendationResult {
  if (profile.allowLocalProviders === false && profile.allowRemoteProviders === false) {
    return RecommendationResultSchema.parse({
      singleModel: null,
      multiModel: [],
      hardwareSpec: spec,
      profileName: profile.name ?? 'unknown',
      advisory: 'No providers are enabled for the current profile, so no recommendation can be made.',
    });
  }

  if (profile.allowLocalProviders === false && profile.allowRemoteProviders === true) {
    return RecommendationResultSchema.parse({
      ...buildRemoteRecommendations(spec),
      profileName: profile.name ?? 'remote-only',
    });
  }

  const tier = resolveRecommendationTier(spec);
  return RecommendationResultSchema.parse({
    ...buildLocalRecommendations(spec, tier),
    profileName: profile.name ?? 'local-only',
  });
}
