/**
 * First-run wizard state — server-side only.
 *
 * Backend step shape (`FIRST_RUN_STEP_VALUES`, `FirstRunStateSchema`, etc.) is
 * imported from `@nous/shared` — the cross-package manifest that the renderer's
 * `WIZARD_STEP_REGISTRY` validates against at module load. See Decision 2
 * (`wizard-composability-pattern-v1`) and ADR 016.
 *
 * Function bodies here are unchanged vs. pre-migration: they already iterated
 * `FIRST_RUN_STEP_VALUES` and read `state.steps[step]`, so the shift from
 * hand-authored to imported constants is transparent.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  FIRST_RUN_STEP_VALUES,
  FirstRunCurrentStepSchema,
  FirstRunStateSchema,
  FirstRunStepSchema,
  FirstRunStepStateSchema,
  FirstRunStepStatusSchema,
  ModelRoleSchema,
  type FirstRunCurrentStep,
  type FirstRunState,
  type FirstRunStep,
  type FirstRunStepState,
  type FirstRunStepStatus,
  type IProjectStore,
} from '@nous/shared';
import { z } from 'zod';
import {
  HardwareSpecSchema,
  RecommendationResultSchema,
  ValidationStateSchema,
} from './hardware-detection';
import { OllamaStatusSchema } from './ollama-detection';

// Re-export the shared-package manifest + schemas so existing consumers that
// imported these names from `@nous/shared-server` continue to resolve. Note:
// `FIRST_RUN_STEP_VALUES` is a NEW public export on this module (previously a
// private non-exported const — see SDS-review note 3 and the completion report
// deviations section).
export {
  FIRST_RUN_STEP_VALUES,
  FirstRunCurrentStepSchema,
  FirstRunStateSchema,
  FirstRunStepSchema,
  FirstRunStepStateSchema,
  FirstRunStepStatusSchema,
};
export type {
  FirstRunCurrentStep,
  FirstRunState,
  FirstRunStep,
  FirstRunStepState,
  FirstRunStepStatus,
};

const FLAG_FILE = '.nous-first-run-complete';
const STATE_FILE = '.nous-first-run-state.json';

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
  // SP 1.5 — registry-availability validation map keyed by `modelSpec`.
  // Optional in the schema so historic call sites and fixtures (which may
  // not include the field) continue to validate. Production
  // `firstRun.checkPrerequisites` always populates this map.
  validation: z.record(z.string(), ValidationStateSchema).optional(),
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
  const steps = Object.fromEntries(
    FIRST_RUN_STEP_VALUES.map((step) => [step, buildPendingStepState()] as const),
  ) as Record<FirstRunStep, FirstRunStepState>;
  return normalizeFirstRunState(
    {
      // SP 1.7 Fix #3 — replace dead literal `'ollama_check'` with
      // `FIRST_RUN_STEP_VALUES[0]`. `normalizeFirstRunState` re-derives
      // `currentStep` via `deriveCurrentStep` immediately after, so this
      // value is replaced on first read; the sourced literal is a
      // clarification only.
      currentStep: FIRST_RUN_STEP_VALUES[0],
      complete: false,
      steps,
      lastUpdatedAt: timestamp,
    },
    timestamp,
  );
}

function createCompletedFirstRunState(
  timestamp = new Date().toISOString(),
): FirstRunState {
  const steps = Object.fromEntries(
    FIRST_RUN_STEP_VALUES.map(
      (step) =>
        [step, { status: 'complete', completedAt: timestamp }] as const,
    ),
  ) as Record<FirstRunStep, FirstRunStepState>;
  return normalizeFirstRunState(
    {
      currentStep: 'complete',
      complete: true,
      steps,
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
