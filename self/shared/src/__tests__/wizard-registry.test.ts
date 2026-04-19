import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_STEP_VALUES,
  FirstRunStateSchema,
  WizardRegistryInvariantError,
  assertRegistryMatchesManifest,
  buildFirstRunStateStepsSchema,
  defineWizardStep,
  deriveBackendStepToWizardStep,
  deriveFirstRunStepValues,
  derivePreviousStepMap,
  deriveWizardStepIds,
  validateWizardRegistry,
  type FirstRunStep,
  type WizardStepDefinition,
} from '../wizard-registry.js';

describe('wizard-registry — factory defaults', () => {
  it('defaults extraBackendSteps to []', () => {
    const step = defineWizardStep({
      id: 'welcome',
      label: 'Welcome',
      component: null,
      backendStep: null,
      previous: null,
      skippable: false,
    });
    expect(step.extraBackendSteps).toEqual([]);
  });

  it('defaults condition to always-true', () => {
    const step = defineWizardStep({
      id: 'welcome',
      label: 'Welcome',
      component: null,
      backendStep: null,
      previous: null,
      skippable: false,
    });
    expect(
      step.condition({
        currentStep: 'ollama_check',
        complete: false,
        steps: {
          ollama_check: { status: 'pending' },
          agent_identity: { status: 'pending' },
          model_download: { status: 'pending' },
          provider_config: { status: 'pending' },
          role_assignment: { status: 'pending' },
        },
        lastUpdatedAt: '2026-04-18T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('preserves literal ids', () => {
    const step = defineWizardStep({
      id: 'welcome',
      label: 'Welcome',
      component: null,
      backendStep: null,
      previous: null,
      skippable: false,
    });
    // Type assertion: literal id preserved (compile-time check).
    const id: 'welcome' = step.id;
    expect(id).toBe('welcome');
  });
});

describe('wizard-registry — manifest / schema', () => {
  it('FIRST_RUN_STEP_VALUES is the canonical SP 1.3 tuple (agent_identity included)', () => {
    // SP 1.3 — SDS § 0 Note 2 Posture (i): `agent_identity` lives in the
    // manifest tuple so the `firstRun.writeIdentity` tRPC procedure can call
    // `markStepComplete(dataDir, 'agent_identity')` legally. The renderer
    // registry row lands in SP 1.4.
    expect(FIRST_RUN_STEP_VALUES).toEqual([
      'ollama_check',
      'agent_identity',
      'model_download',
      'provider_config',
      'role_assignment',
    ]);
    expect(FIRST_RUN_STEP_VALUES).toContain('agent_identity');
  });

  it('buildFirstRunStateStepsSchema keys equal FIRST_RUN_STEP_VALUES', () => {
    const schema = buildFirstRunStateStepsSchema();
    const keys = Object.keys(schema.shape);
    expect(keys).toEqual([...FIRST_RUN_STEP_VALUES]);
  });

  it('FirstRunStateSchema.parse round-trips a canonical SP 1.3 fixture', () => {
    const fixture = {
      currentStep: 'model_download' as const,
      complete: false,
      steps: {
        ollama_check: {
          status: 'complete' as const,
          completedAt: '2026-03-22T00:04:00.000Z',
        },
        agent_identity: { status: 'pending' as const },
        model_download: { status: 'pending' as const },
        provider_config: { status: 'pending' as const },
        role_assignment: { status: 'pending' as const },
      },
      lastUpdatedAt: '2026-03-22T00:05:00.000Z',
    };
    const parsed = FirstRunStateSchema.parse(fixture);
    expect(parsed).toEqual(fixture);
  });
});

// Build a V1-shaped registry using the factory. Different entries will be
// mutated per negative test to exercise each invariant.
function buildValidV1Registry() {
  return [
    defineWizardStep({
      id: 'welcome',
      label: 'Welcome',
      component: null,
      backendStep: null,
      previous: null,
      skippable: false,
    }),
    defineWizardStep({
      id: 'ollama-setup',
      label: 'Ollama',
      component: null,
      backendStep: 'ollama_check',
      previous: 'welcome',
      skippable: true,
    }),
    defineWizardStep({
      id: 'model-download',
      label: 'Model',
      component: null,
      backendStep: 'model_download',
      // SP 1.3 — `agent_identity` added to the V1 test fixture's
      // extraBackendSteps so `assertRegistryMatchesManifest` keeps full
      // coverage after the manifest gained `agent_identity`. SP 1.4 will land
      // a dedicated `agent-identity` wizard step row owning the `agent_identity`
      // backend step; this fixture remains a synthetic test-only registry.
      extraBackendSteps: ['agent_identity', 'provider_config', 'role_assignment'],
      previous: 'ollama-setup',
      skippable: true,
    }),
    defineWizardStep({
      id: 'confirmation',
      label: 'Finish',
      component: null,
      backendStep: null,
      previous: 'model-download',
      skippable: false,
    }),
  ] as const satisfies readonly WizardStepDefinition<string, unknown, FirstRunStep>[];
}

describe('wizard-registry — validateWizardRegistry', () => {
  it('accepts a minimal valid registry', () => {
    const registry = buildValidV1Registry();
    expect(() => validateWizardRegistry(registry)).not.toThrow();
  });

  it('throws empty-registry for a zero-entry registry', () => {
    const err = (() => {
      try {
        validateWizardRegistry([]);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err).toBeInstanceOf(WizardRegistryInvariantError);
    expect(err?.code).toBe('empty-registry');
  });

  it('throws duplicate-id when two entries share an id', () => {
    const registry = [
      defineWizardStep({
        id: 'welcome',
        label: 'Welcome',
        component: null,
        backendStep: null,
        previous: null,
        skippable: false,
      }),
      defineWizardStep({
        id: 'welcome',
        label: 'Welcome (dup)',
        component: null,
        backendStep: 'ollama_check',
        previous: 'welcome',
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        validateWizardRegistry(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('duplicate-id');
  });

  it('throws duplicate-backend-step when a backend step appears twice', () => {
    const registry = [
      defineWizardStep({
        id: 'a',
        label: 'A',
        component: null,
        backendStep: 'ollama_check',
        previous: null,
        skippable: false,
      }),
      defineWizardStep({
        id: 'b',
        label: 'B',
        component: null,
        backendStep: 'ollama_check',
        previous: 'a',
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        validateWizardRegistry(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('duplicate-backend-step');
  });

  it('throws duplicate-backend-step when backendStep + extraBackendSteps collide', () => {
    const registry = [
      defineWizardStep({
        id: 'a',
        label: 'A',
        component: null,
        backendStep: 'ollama_check',
        extraBackendSteps: ['ollama_check'],
        previous: null,
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        validateWizardRegistry(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('duplicate-backend-step');
  });

  it('throws invalid-previous for a previous id that does not exist', () => {
    const registry = [
      defineWizardStep({
        id: 'a',
        label: 'A',
        component: null,
        backendStep: null,
        previous: null,
        skippable: false,
      }),
      defineWizardStep({
        id: 'b',
        label: 'B',
        component: null,
        backendStep: 'ollama_check',
        previous: 'does-not-exist',
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        validateWizardRegistry(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('invalid-previous');
  });

  it('throws multiple-roots when more than one entry has previous: null', () => {
    const registry = [
      defineWizardStep({
        id: 'a',
        label: 'A',
        component: null,
        backendStep: null,
        previous: null,
        skippable: false,
      }),
      defineWizardStep({
        id: 'b',
        label: 'B',
        component: null,
        backendStep: 'ollama_check',
        previous: null,
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        validateWizardRegistry(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('multiple-roots');
  });
});

describe('wizard-registry — assertRegistryMatchesManifest', () => {
  it('passes for a V1-shaped registry', () => {
    const registry = buildValidV1Registry();
    expect(() => assertRegistryMatchesManifest(registry)).not.toThrow();
  });

  it('throws manifest-mismatch on undercoverage (missing backend step)', () => {
    // Drop `role_assignment` from extras — registry under-covers the manifest.
    const registry = [
      defineWizardStep({
        id: 'welcome',
        label: 'Welcome',
        component: null,
        backendStep: null,
        previous: null,
        skippable: false,
      }),
      defineWizardStep({
        id: 'ollama-setup',
        label: 'Ollama',
        component: null,
        backendStep: 'ollama_check',
        previous: 'welcome',
        skippable: true,
      }),
      defineWizardStep({
        id: 'model-download',
        label: 'Model',
        component: null,
        backendStep: 'model_download',
        // SP 1.3 — under-covers manifest: missing `agent_identity` AND
        // `role_assignment` from extras (manifest now has 5 entries).
        extraBackendSteps: ['provider_config'],
        previous: 'ollama-setup',
        skippable: true,
      }),
      defineWizardStep({
        id: 'confirmation',
        label: 'Finish',
        component: null,
        backendStep: null,
        previous: 'model-download',
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        assertRegistryMatchesManifest(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('manifest-mismatch');
  });

  it('throws manifest-mismatch on overcoverage (extra step declared)', () => {
    // `validateWizardRegistry` would reject this for duplicate-backend-step
    // in a real registry; `assertRegistryMatchesManifest` is a separate check.
    // Build an over-sized registry by adding an extra entry with a *different*
    // backend step not in the manifest — but the manifest is the full enum, so
    // the only way to exceed coverage without duplicates is to have MORE
    // entries than FIRST_RUN_STEP_VALUES.length. We achieve that by adding an
    // empty-slot duplicate at extras.
    const registry = [
      defineWizardStep({
        id: 'welcome',
        label: 'Welcome',
        component: null,
        backendStep: null,
        previous: null,
        skippable: false,
      }),
      defineWizardStep({
        id: 'ollama-setup',
        label: 'Ollama',
        component: null,
        backendStep: 'ollama_check',
        previous: 'welcome',
        skippable: true,
      }),
      defineWizardStep({
        id: 'model-download',
        label: 'Model',
        component: null,
        backendStep: 'model_download',
        extraBackendSteps: [
          'agent_identity',
          'provider_config',
          'role_assignment',
          'role_assignment', // duplicate — forces count > manifest length
        ],
        previous: 'ollama-setup',
        skippable: true,
      }),
      defineWizardStep({
        id: 'confirmation',
        label: 'Finish',
        component: null,
        backendStep: null,
        previous: 'model-download',
        skippable: false,
      }),
    ];
    const err = (() => {
      try {
        assertRegistryMatchesManifest(registry);
        return null;
      } catch (caught) {
        return caught as WizardRegistryInvariantError;
      }
    })();
    expect(err?.code).toBe('manifest-mismatch');
  });
});

describe('wizard-registry — derivations', () => {
  it('deriveFirstRunStepValues matches the manifest as a permutation', () => {
    const registry = buildValidV1Registry();
    const derived = deriveFirstRunStepValues(registry);
    expect(new Set(derived)).toEqual(new Set(FIRST_RUN_STEP_VALUES));
  });

  it('deriveFirstRunStepValues preserves the registry ordering for V1 registry', () => {
    const registry = buildValidV1Registry();
    const derived = deriveFirstRunStepValues(registry);
    // V1 entries visit backend steps in registry-traversal order:
    //   ollama-setup → ollama_check
    //   model-download → model_download, then extras
    //                    [agent_identity, provider_config, role_assignment]
    // SP 1.3 fixture extension — see buildValidV1Registry comment.
    expect(derived).toEqual([
      'ollama_check',
      'model_download',
      'agent_identity',
      'provider_config',
      'role_assignment',
    ]);
  });

  it('deriveBackendStepToWizardStep maps every backend step to the owning entry id', () => {
    const registry = buildValidV1Registry();
    const map = deriveBackendStepToWizardStep(registry);
    expect(map).toEqual({
      ollama_check: 'ollama-setup',
      agent_identity: 'model-download',
      model_download: 'model-download',
      provider_config: 'model-download',
      role_assignment: 'model-download',
    });
  });

  it('derivePreviousStepMap yields the V1 back-nav chain', () => {
    const registry = buildValidV1Registry();
    const map = derivePreviousStepMap(registry);
    expect(map).toEqual({
      welcome: null,
      'ollama-setup': 'welcome',
      'model-download': 'ollama-setup',
      confirmation: 'model-download',
    });
  });

  it('deriveWizardStepIds returns ids in registry order', () => {
    const registry = buildValidV1Registry();
    expect(deriveWizardStepIds(registry)).toEqual([
      'welcome',
      'ollama-setup',
      'model-download',
      'confirmation',
    ]);
  });
});
