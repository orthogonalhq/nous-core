/**
 * First-run wizard state — server-side only.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ModelRoleSchema, type IProjectStore } from '@nous/shared';
import { z } from 'zod';
import { HardwareSpecSchema, RecommendationResultSchema } from './hardware-detection';
import { OllamaStatusSchema } from './ollama-detection';

const FLAG_FILE = '.nous-first-run-complete';
const STATE_FILE = '.nous-first-run-state.json';
const FIRST_RUN_STEP_VALUES = [
  'ollama_check',
  'model_download',
  'provider_config',
  'role_assignment',
] as const;

export const FirstRunStepSchema = z.enum(FIRST_RUN_STEP_VALUES);
export type FirstRunStep = z.infer<typeof FirstRunStepSchema>;

export const FirstRunCurrentStepSchema = z.union([
  FirstRunStepSchema,
  z.literal('complete'),
]);
export type FirstRunCurrentStep = z.infer<typeof FirstRunCurrentStepSchema>;

export const FirstRunStepStatusSchema = z.enum(['pending', 'complete']);
export type FirstRunStepStatus = z.infer<typeof FirstRunStepStatusSchema>;

export const FirstRunStepStateSchema = z.object({
  status: FirstRunStepStatusSchema,
  completedAt: z.string().optional(),
});
export type FirstRunStepState = z.infer<typeof FirstRunStepStateSchema>;

export const FirstRunStateSchema = z.object({
  currentStep: FirstRunCurrentStepSchema,
  complete: z.boolean(),
  steps: z.object({
    ollama_check: FirstRunStepStateSchema,
    model_download: FirstRunStepStateSchema,
    provider_config: FirstRunStepStateSchema,
    role_assignment: FirstRunStepStateSchema,
  }),
  completedAt: z.string().optional(),
  lastUpdatedAt: z.string(),
});
export type FirstRunState = z.infer<typeof FirstRunStateSchema>;

export const FirstRunRoleAssignmentInputSchema = z.object({
  role: ModelRoleSchema,
  modelSpec: z.string().min(1),
});
export type FirstRunRoleAssignmentInput = z.infer<
  typeof FirstRunRoleAssignmentInputSchema
>;

export const FirstRunActionResultSchema = z.object({
  success: z.boolean(),
  state: FirstRunStateSchema,
  error: z.string().optional(),
});
export type FirstRunActionResult = z.infer<typeof FirstRunActionResultSchema>;

export const FirstRunPrerequisitesSchema = z.object({
  ollama: OllamaStatusSchema,
  hardware: HardwareSpecSchema,
  recommendations: RecommendationResultSchema,
});
export type FirstRunPrerequisites = z.infer<typeof FirstRunPrerequisitesSchema>;

function flagPath(dataDir: string): string {
  return join(dataDir, FLAG_FILE);
}

function statePath(dataDir: string): string {
  return join(dataDir, STATE_FILE);
}

function buildPendingStepState(): FirstRunStepState {
  return {
    status: 'pending',
  };
}

function deriveCurrentStep(
  steps: FirstRunState['steps'],
): FirstRunCurrentStep {
  for (const step of FIRST_RUN_STEP_VALUES) {
    if (steps[step].status !== 'complete') {
      return step;
    }
  }

  return 'complete';
}

function normalizeFirstRunState(
  state: FirstRunState,
  timestamp = new Date().toISOString(),
): FirstRunState {
  const currentStep = deriveCurrentStep(state.steps);
  const complete = currentStep === 'complete';
  const completedAt = complete
    ? state.completedAt ?? timestamp
    : undefined;

  return FirstRunStateSchema.parse({
    ...state,
    currentStep,
    complete,
    completedAt,
    lastUpdatedAt: state.lastUpdatedAt || timestamp,
  });
}

export function createDefaultFirstRunState(
  timestamp = new Date().toISOString(),
): FirstRunState {
  return normalizeFirstRunState(
    {
      currentStep: 'ollama_check',
      complete: false,
      steps: {
        ollama_check: buildPendingStepState(),
        model_download: buildPendingStepState(),
        provider_config: buildPendingStepState(),
        role_assignment: buildPendingStepState(),
      },
      lastUpdatedAt: timestamp,
    },
    timestamp,
  );
}

function createCompletedFirstRunState(
  timestamp = new Date().toISOString(),
): FirstRunState {
  return normalizeFirstRunState(
    {
      currentStep: 'complete',
      complete: true,
      steps: {
        ollama_check: { status: 'complete', completedAt: timestamp },
        model_download: { status: 'complete', completedAt: timestamp },
        provider_config: { status: 'complete', completedAt: timestamp },
        role_assignment: { status: 'complete', completedAt: timestamp },
      },
      completedAt: timestamp,
      lastUpdatedAt: timestamp,
    },
    timestamp,
  );
}

function writeFlag(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(flagPath(dataDir), '{}', 'utf-8');
}

function writeFirstRunStateSync(
  dataDir: string,
  state: FirstRunState,
): FirstRunState {
  const nextState = normalizeFirstRunState(state);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    statePath(dataDir),
    `${JSON.stringify(nextState, null, 2)}\n`,
    'utf-8',
  );

  if (nextState.complete) {
    writeFlag(dataDir);
  }

  return nextState;
}

function readStateFromDisk(dataDir: string): FirstRunState {
  if (existsSync(flagPath(dataDir)) && !existsSync(statePath(dataDir))) {
    return createCompletedFirstRunState();
  }

  if (!existsSync(statePath(dataDir))) {
    return createDefaultFirstRunState();
  }

  try {
    const raw = readFileSync(statePath(dataDir), 'utf-8');
    const parsed = FirstRunStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return normalizeFirstRunState(parsed.data, parsed.data.lastUpdatedAt);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[nous:first-run] Failed to read state file: ${message}`);
  }

  if (existsSync(flagPath(dataDir))) {
    return createCompletedFirstRunState();
  }

  return createDefaultFirstRunState();
}

export async function isFirstRunComplete(
  dataDir: string,
  projectStore: IProjectStore,
): Promise<boolean> {
  if (existsSync(flagPath(dataDir))) {
    return true;
  }

  const state = readStateFromDisk(dataDir);
  if (state.complete) {
    return true;
  }

  const projects = await projectStore.list();
  return projects.length > 0;
}

export async function getFirstRunState(dataDir: string): Promise<FirstRunState> {
  const state = readStateFromDisk(dataDir);
  const summary = FIRST_RUN_STEP_VALUES.map(
    (step) => `${step}:${state.steps[step].status}`,
  ).join(', ');
  console.debug(`[nous:first-run] State loaded: ${summary}`);
  return state;
}

export function getCurrentStep(state: FirstRunState): FirstRunCurrentStep {
  return deriveCurrentStep(state.steps);
}

export async function markStepComplete(
  dataDir: string,
  step: FirstRunStep,
): Promise<FirstRunState> {
  const timestamp = new Date().toISOString();
  const current = readStateFromDisk(dataDir);
  const nextState = writeFirstRunStateSync(dataDir, {
    ...current,
    steps: {
      ...current.steps,
      [step]: {
        status: 'complete',
        completedAt: current.steps[step].completedAt ?? timestamp,
      },
    },
    lastUpdatedAt: timestamp,
  });

  console.info(`[nous:first-run] Step ${step} marked complete`);
  return nextState;
}

export async function resetFirstRunState(dataDir: string): Promise<FirstRunState> {
  rmSync(flagPath(dataDir), { force: true });
  rmSync(statePath(dataDir), { force: true });
  return writeFirstRunStateSync(dataDir, createDefaultFirstRunState());
}

export function markFirstRunComplete(dataDir: string): void {
  writeFlag(dataDir);
  writeFirstRunStateSync(dataDir, createCompletedFirstRunState());
  console.log('[nous:first-run] complete');
}
