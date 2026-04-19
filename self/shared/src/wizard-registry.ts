/**
 * First-run wizard registry — cross-package single source of truth.
 *
 * Shared between:
 *   - `@nous/shared-server` (persistence, state machine)
 *   - `@nous/desktop` renderer (step components, back-nav, stepper)
 *
 * Pattern ratified by Decision 2 (wizard-composability-pattern-v1) and extended
 * by ADR 016 (one optional field — `extraBackendSteps` — to allow one wizard
 * step to drive multiple state-machine transitions).
 *
 * The shared-package manifest (`FIRST_RUN_STEP_VALUES`) is the single source of
 * truth for the backend step shape. The renderer's `WIZARD_STEP_REGISTRY`
 * validates against this manifest at module load (see
 * `assertRegistryMatchesManifest`).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Backend step manifest — the single source of truth for state-machine shape.
// ---------------------------------------------------------------------------

// SP 1.3 — `agent_identity` added per SDS § 0 Note 2 Posture (i): the
// backend-step constant lands with the SP 1.3 tooling sub-phase so the
// `firstRun.writeIdentity` tRPC procedure's `markStepComplete(dataDir,
// 'agent_identity')` call typechecks. The matching renderer-side
// `WIZARD_STEP_REGISTRY` row (with `component: WizardStepIdentity`) lands in
// SP 1.4 — until then the renderer's `assertRegistryMatchesManifest` will
// throw at module load (SDS § 4 F4; SP 1.4 task #1 mitigation).
//
// SP 1.7 — tuple order mirrors the renderer's `WIZARD_STEP_REGISTRY`
// user-facing flow per ADR 022 (renderer is canonical user-facing flow).
// `agent_identity` is at position 0 so the user customizes the agent before
// the first prerequisite check; the position-mirror invariant is enforced by
// the cross-package test in
// `self/apps/desktop/src/renderer/src/components/wizard/__tests__/WizardSteps.test.tsx`.
export const FIRST_RUN_STEP_VALUES = [
  'agent_identity',
  'ollama_check',
  'model_download',
  'provider_config',
  'role_assignment',
] as const;

export type FirstRunStep = (typeof FIRST_RUN_STEP_VALUES)[number];

export const FirstRunStepSchema = z.enum(FIRST_RUN_STEP_VALUES);

export const FirstRunCurrentStepSchema = z.union([
  FirstRunStepSchema,
  z.literal('complete'),
]);
export type FirstRunCurrentStep = z.infer<typeof FirstRunCurrentStepSchema>;

// ---------------------------------------------------------------------------
// Per-step state schema (unchanged shape vs. today's shared-server/first-run.ts).
// ---------------------------------------------------------------------------

export const FirstRunStepStatusSchema = z.enum(['pending', 'complete']);
export type FirstRunStepStatus = z.infer<typeof FirstRunStepStatusSchema>;

export const FirstRunStepStateSchema = z.object({
  status: FirstRunStepStatusSchema,
  completedAt: z.string().optional(),
});
export type FirstRunStepState = z.infer<typeof FirstRunStepStateSchema>;

// ---------------------------------------------------------------------------
// Derived `steps` object schema (keyed by FirstRunStep).
// ---------------------------------------------------------------------------

export function buildFirstRunStateStepsSchema(
  stepStateSchema: z.ZodTypeAny = FirstRunStepStateSchema,
): z.ZodObject<Record<FirstRunStep, z.ZodTypeAny>> {
  const shape = Object.fromEntries(
    FIRST_RUN_STEP_VALUES.map((step) => [step, stepStateSchema] as const),
  ) as Record<FirstRunStep, z.ZodTypeAny>;
  return z.object(shape);
}

// ---------------------------------------------------------------------------
// Full state schema.
// ---------------------------------------------------------------------------

export const FirstRunStateSchema = z.object({
  currentStep: FirstRunCurrentStepSchema,
  complete: z.boolean(),
  steps: buildFirstRunStateStepsSchema(),
  completedAt: z.string().optional(),
  lastUpdatedAt: z.string(),
});
export type FirstRunState = z.infer<typeof FirstRunStateSchema>;

// ---------------------------------------------------------------------------
// Wizard step definition shape.
//
// Generics:
//   - `TId`          — the step's literal id (e.g. `'welcome'`).
//   - `TComponent`   — the step's bound component (renderer narrows this to
//                      `React.ComponentType<WizardStepProps>`; `@nous/shared`
//                      is React-agnostic and leaves it as `unknown`).
//   - `TBackendStep` — the set of backend steps the entry may drive.
//
// Default generic values come from the SDS § 4.1 authoritative form.
// ---------------------------------------------------------------------------

export type WizardStepDefinition<
  TId extends string = string,
  TComponent = unknown,
  TBackendStep extends FirstRunStep = FirstRunStep,
> = {
  readonly id: TId;
  readonly label: string;
  readonly component: TComponent;
  readonly backendStep: TBackendStep | null;
  /**
   * Additional backend steps this wizard step's completion handler also drives.
   *
   * Used when a single wizard step covers multiple state-machine transitions
   * (e.g. `model-download` drives `model_download` + `provider_config` +
   * `role_assignment` via its completion handler — see ADR 016).
   *
   * Defaults to the empty array.
   */
  readonly extraBackendSteps: readonly TBackendStep[];
  readonly previous: string | null;
  readonly skippable: boolean;
  readonly condition: (state: FirstRunState) => boolean;
};

// ---------------------------------------------------------------------------
// Factory — narrow-generic identity function with defaults applied.
// ---------------------------------------------------------------------------

export function defineWizardStep<
  const TId extends string,
  TComponent,
  const TBackendStep extends FirstRunStep,
>(def: {
  id: TId;
  label: string;
  component: TComponent;
  backendStep: TBackendStep | null;
  extraBackendSteps?: readonly TBackendStep[];
  previous: string | null;
  skippable: boolean;
  condition?: (state: FirstRunState) => boolean;
}): WizardStepDefinition<TId, TComponent, TBackendStep> {
  return {
    id: def.id,
    label: def.label,
    component: def.component,
    backendStep: def.backendStep,
    extraBackendSteps: def.extraBackendSteps ?? [],
    previous: def.previous,
    skippable: def.skippable,
    condition: def.condition ?? (() => true),
  };
}

// ---------------------------------------------------------------------------
// Derivation helpers — pure functions over a readonly registry tuple.
// ---------------------------------------------------------------------------

type MinimalEntry = {
  readonly id: string;
  readonly backendStep: FirstRunStep | null;
  readonly extraBackendSteps: readonly FirstRunStep[];
  readonly previous: string | null;
};

function collectBackendSteps<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): FirstRunStep[] {
  const collected: FirstRunStep[] = [];
  for (const entry of registry) {
    if (entry.backendStep !== null) {
      collected.push(entry.backendStep);
    }
    for (const extra of entry.extraBackendSteps) {
      collected.push(extra);
    }
  }
  return collected;
}

export function deriveFirstRunStepValues<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): readonly FirstRunStep[] {
  return collectBackendSteps(registry);
}

export function deriveFirstRunStateSchema<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
  stepStateSchema: z.ZodTypeAny = FirstRunStepStateSchema,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const steps = collectBackendSteps(registry);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const step of steps) {
    shape[step] = stepStateSchema;
  }
  return z.object(shape);
}

export function deriveBackendStepToWizardStep<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): Record<FirstRunStep, string> {
  const map: Partial<Record<FirstRunStep, string>> = {};
  for (const entry of registry) {
    if (entry.backendStep !== null) {
      map[entry.backendStep] = entry.id;
    }
    for (const extra of entry.extraBackendSteps) {
      map[extra] = entry.id;
    }
  }
  return map as Record<FirstRunStep, string>;
}

export function derivePreviousStepMap<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const entry of registry) {
    map[entry.id] = entry.previous;
  }
  return map;
}

export function deriveWizardStepIds<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): readonly string[] {
  return registry.map((entry) => entry.id);
}

// ---------------------------------------------------------------------------
// Invariant machinery — thrown at module load when a registry is malformed.
// ---------------------------------------------------------------------------

export type WizardRegistryInvariantCode =
  | 'empty-registry'
  | 'duplicate-id'
  | 'duplicate-backend-step'
  | 'invalid-previous'
  | 'multiple-roots'
  | 'manifest-mismatch';

export class WizardRegistryInvariantError extends Error {
  readonly code: WizardRegistryInvariantCode;

  constructor(code: WizardRegistryInvariantCode, message: string) {
    super(message);
    this.name = 'WizardRegistryInvariantError';
    this.code = code;
  }
}

export function validateWizardRegistry<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): void {
  if (registry.length === 0) {
    throw new WizardRegistryInvariantError(
      'empty-registry',
      'Wizard registry is empty — at least one step entry is required.',
    );
  }

  const ids = new Set<string>();
  for (const entry of registry) {
    if (ids.has(entry.id)) {
      throw new WizardRegistryInvariantError(
        'duplicate-id',
        `Wizard registry has duplicate id: ${entry.id}`,
      );
    }
    ids.add(entry.id);
  }

  const backendSteps = new Set<FirstRunStep>();
  for (const entry of registry) {
    const candidates: FirstRunStep[] = [];
    if (entry.backendStep !== null) {
      candidates.push(entry.backendStep);
    }
    candidates.push(...entry.extraBackendSteps);
    for (const step of candidates) {
      if (backendSteps.has(step)) {
        throw new WizardRegistryInvariantError(
          'duplicate-backend-step',
          `Wizard registry has duplicate backend step: ${step} (on entry ${entry.id})`,
        );
      }
      backendSteps.add(step);
    }
  }

  let rootCount = 0;
  for (const entry of registry) {
    if (entry.previous === null) {
      rootCount += 1;
      continue;
    }
    if (!ids.has(entry.previous)) {
      throw new WizardRegistryInvariantError(
        'invalid-previous',
        `Wizard registry entry ${entry.id} has invalid previous id: ${entry.previous}`,
      );
    }
  }
  if (rootCount > 1) {
    throw new WizardRegistryInvariantError(
      'multiple-roots',
      `Wizard registry has more than one root entry (previous: null): count=${rootCount}`,
    );
  }
}

export function assertRegistryMatchesManifest<TEntry extends MinimalEntry>(
  registry: readonly TEntry[],
): void {
  const collected = collectBackendSteps(registry);
  const manifestSet = new Set<FirstRunStep>(FIRST_RUN_STEP_VALUES);
  const collectedSet = new Set<FirstRunStep>(collected);

  if (collected.length !== FIRST_RUN_STEP_VALUES.length) {
    throw new WizardRegistryInvariantError(
      'manifest-mismatch',
      `Wizard registry backend-step count ${collected.length} does not match manifest length ${FIRST_RUN_STEP_VALUES.length}`,
    );
  }

  for (const step of manifestSet) {
    if (!collectedSet.has(step)) {
      throw new WizardRegistryInvariantError(
        'manifest-mismatch',
        `Wizard registry is missing required backend step: ${step}`,
      );
    }
  }

  for (const step of collectedSet) {
    if (!manifestSet.has(step)) {
      throw new WizardRegistryInvariantError(
        'manifest-mismatch',
        `Wizard registry declares unknown backend step: ${step}`,
      );
    }
  }
}
