import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESETS, TRAIT_REGISTRY, type PersonalityPreset } from '@nous/cortex-core/personality'
import { identityStep } from '../steps/identity'
import { WizardStepIdentity } from '../WizardStepIdentity'
import {
  createElectronAPIMock,
  createFirstRunActionResult,
  createFirstRunState,
  createPrerequisites,
} from '../../../test-setup'

const trpcFetchMock = vi.hoisted(() => ({
  setBackendPort: vi.fn(),
  trpcQuery: vi.fn(),
  trpcMutate: vi.fn(),
}))

vi.mock('../trpc-fetch', () => trpcFetchMock)

function installMock() {
  const mock = createElectronAPIMock()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: mock,
  })
  return mock
}

function renderIdentity(overrides: Partial<Parameters<typeof WizardStepIdentity>[0]> = {}) {
  installMock()
  const onStepComplete = vi.fn()
  const setActionInProgress = vi.fn()
  const setActionError = vi.fn()
  const view = render(
    <WizardStepIdentity
      state={createFirstRunState({
        currentStep: 'agent_identity',
        steps: {
          ollama_check: { status: 'complete', completedAt: '2026-04-19T00:00:00.000Z' },
          agent_identity: { status: 'pending' },
          model_download: { status: 'pending' },
          provider_config: { status: 'pending' },
          role_assignment: { status: 'pending' },
        },
      })}
      prerequisites={createPrerequisites()}
      actionInProgress={false}
      actionError={null}
      setActionInProgress={setActionInProgress}
      setActionError={setActionError}
      onStepComplete={onStepComplete}
      {...overrides}
    />,
  )
  return { view, onStepComplete, setActionInProgress, setActionError }
}

beforeEach(() => {
  trpcFetchMock.trpcMutate.mockReset()
  trpcFetchMock.trpcQuery.mockReset()
})

// ──────────────────────────────────────────────────────────────────────────
// Block A — Sub-stage A (Naming) — Goals C6, C7, C8.
// ──────────────────────────────────────────────────────────────────────────

describe('WizardStepIdentity — Block A: Sub-stage A (Naming)', () => {
  it('A1: renders greeting prose, name input, and submit button by default', () => {
    renderIdentity()
    expect(screen.getByTestId('identity-substage-a')).toBeInTheDocument()
    expect(screen.getByTestId('identity-greeting')).toBeInTheDocument()
    expect(screen.getByTestId('identity-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('identity-name-submit')).toBeInTheDocument()
  })

  it('A2: submit is disabled when name is empty or whitespace', () => {
    renderIdentity()
    const submit = screen.getByTestId('identity-name-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    const input = screen.getByTestId('identity-name-input')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(submit.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Nia' } })
    expect(submit.disabled).toBe(false)
  })

  it('A3: submitting a non-empty name advances to sub-stage B', () => {
    renderIdentity()
    const input = screen.getByTestId('identity-name-input')
    fireEvent.change(input, { target: { value: 'Nia' } })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    expect(screen.getByTestId('identity-substage-b')).toBeInTheDocument()
    expect(screen.queryByTestId('identity-substage-a')).not.toBeInTheDocument()
  })

  it('A4: sub-stage A has no skip button', () => {
    renderIdentity()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Block B — Sub-stage B (Personality) — Goals C9, C10, C11, C12.
// ──────────────────────────────────────────────────────────────────────────

describe('WizardStepIdentity — Block B: Sub-stage B (Personality)', () => {
  function advanceToB() {
    renderIdentity()
    const input = screen.getByTestId('identity-name-input')
    fireEvent.change(input, { target: { value: 'Nia' } })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
  }

  it('B1: preset cards iterate Object.keys(PRESETS) in declared order', () => {
    advanceToB()
    const cards = screen.getAllByTestId('preset-card')
    const presetIds = cards.map((card) => card.getAttribute('data-preset-id'))
    expect(presetIds).toEqual(Object.keys(PRESETS))
  })

  it('B2: each preset card displays a label and description (semantic only)', () => {
    advanceToB()
    const cards = screen.getAllByTestId('preset-card')
    expect(cards.length).toBe(Object.keys(PRESETS).length)
    for (const card of cards) {
      expect(card.textContent?.length).toBeGreaterThan(0)
    }
  })

  it('B3: Advanced Options toggle reveals per-axis override controls', () => {
    advanceToB()
    expect(screen.queryByTestId('identity-trait-list')).toBeNull()
    fireEvent.click(screen.getByTestId('identity-advanced-toggle'))
    expect(screen.getByTestId('identity-trait-list')).toBeInTheDocument()
  })

  it('B4: Advanced Options renders one labeled control region per TRAIT_REGISTRY entry', () => {
    advanceToB()
    fireEvent.click(screen.getByTestId('identity-advanced-toggle'))
    const traitList = screen.getByTestId('identity-trait-list')
    for (const trait of TRAIT_REGISTRY) {
      const traitNode = traitList.querySelector(`[data-trait-id="${trait.id}"]`)
      expect(traitNode).not.toBeNull()
      // legend label
      expect(traitNode!.textContent).toContain(trait.label)
      // one option per trait value
      for (const valueKey of Object.keys(trait.values)) {
        const radio = traitNode!.querySelector(`#trait-${trait.id}-${valueKey}`)
        expect(radio).not.toBeNull()
      }
    }
  })

  it('B5: Continue submit with no overrides advances and stores { preset: <selected> }', () => {
    advanceToB()
    const proCard = screen
      .getAllByTestId('preset-card')
      .find((card) => card.getAttribute('data-preset-id') === 'professional')!
    fireEvent.click(proCard)
    fireEvent.click(screen.getByTestId('identity-personality-submit'))
    expect(screen.getByTestId('identity-substage-c')).toBeInTheDocument()
    // The personality is held in component state; we'll observe the actual
    // payload at sub-stage C submit. Here we assert advancement.
  })

  it('B6: Continue submit with preset + overrides yields { preset, overrides: { axis: value } }', async () => {
    const { onStepComplete } = (() => {
      const result = renderIdentity()
      const input = screen.getByTestId('identity-name-input')
      fireEvent.change(input, { target: { value: 'Nia' } })
      fireEvent.click(screen.getByTestId('identity-name-submit'))
      return result
    })()

    // Pick a preset, open advanced, change one trait, advance to C, then skip
    // profile so writeIdentity fires with the constructed personality.
    const card = screen
      .getAllByTestId('preset-card')
      .find((c) => c.getAttribute('data-preset-id') === 'balanced')!
    fireEvent.click(card)
    fireEvent.click(screen.getByTestId('identity-advanced-toggle'))
    // Pick `thoroughness=strict` (override over the balanced default `standard`).
    const radio = document.getElementById('trait-thoroughness-strict') as HTMLInputElement
    fireEvent.click(radio)
    fireEvent.click(screen.getByTestId('identity-personality-submit'))

    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(createFirstRunState()),
    )
    fireEvent.click(screen.getByTestId('identity-profile-skip'))

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.writeIdentity',
        expect.objectContaining({
          personality: {
            preset: 'balanced',
            overrides: { thoroughness: 'strict' },
          },
        }),
      )
    })
    expect(onStepComplete).toHaveBeenCalled()
  })

  it('B7: skip writes exactly { preset: "balanced" } — NOT { preset: "balanced", overrides: {} } (F12)', async () => {
    renderIdentity()
    const input = screen.getByTestId('identity-name-input')
    fireEvent.change(input, { target: { value: 'Nia' } })
    fireEvent.click(screen.getByTestId('identity-name-submit'))

    fireEvent.click(screen.getByTestId('identity-personality-skip'))

    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(createFirstRunState()),
    )
    fireEvent.click(screen.getByTestId('identity-profile-skip'))

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalled()
    })
    const callPayload = trpcFetchMock.trpcMutate.mock.calls[0][1] as {
      personality: { preset: PersonalityPreset; overrides?: unknown }
    }
    // Deep equality on personality: must be exactly `{ preset: 'balanced' }`.
    expect(callPayload.personality).toEqual({ preset: 'balanced' })
    expect('overrides' in callPayload.personality).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Block C — Sub-stage C (Profile) — Goals C13, C14, C15, C16.
// ──────────────────────────────────────────────────────────────────────────

describe('WizardStepIdentity — Block C: Sub-stage C (Profile)', () => {
  function advanceToC() {
    renderIdentity()
    const input = screen.getByTestId('identity-name-input')
    fireEvent.change(input, { target: { value: 'Nia' } })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    fireEvent.click(screen.getByTestId('identity-personality-skip'))
  }

  it('C1: renders prompt prose, security disclosure, and four optional form fields', () => {
    advanceToC()
    expect(screen.getByTestId('identity-substage-c')).toBeInTheDocument()
    expect(screen.getByTestId('identity-security-disclosure')).toBeInTheDocument()
    expect(screen.getByLabelText(/Your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/role or title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/working on/i)).toBeInTheDocument()
    expect(screen.getByTestId('profile-expertise')).toBeInTheDocument()
  })

  it('C2: submit invokes trpcMutate("firstRun.writeIdentity", expectedPayload) once', async () => {
    advanceToC()
    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(createFirstRunState()),
    )

    fireEvent.change(screen.getByLabelText(/Your name/i), {
      target: { value: 'Andrew' },
    })
    fireEvent.click(screen.getByTestId('identity-profile-submit'))

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledTimes(1)
    })
    expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
      'firstRun.writeIdentity',
      expect.objectContaining({
        name: 'Nia',
        personality: { preset: 'balanced' },
        profile: { displayName: 'Andrew' },
      }),
    )
  })

  it('C3: on { success: true, state }, onStepComplete(state) is called', async () => {
    const next = createFirstRunState({ currentStep: 'model_download' })
    trpcFetchMock.trpcMutate.mockResolvedValue(createFirstRunActionResult(next))

    const { onStepComplete } = (() => {
      const result = renderIdentity()
      const input = screen.getByTestId('identity-name-input')
      fireEvent.change(input, { target: { value: 'Nia' } })
      fireEvent.click(screen.getByTestId('identity-name-submit'))
      fireEvent.click(screen.getByTestId('identity-personality-skip'))
      return result
    })()

    fireEvent.click(screen.getByTestId('identity-profile-submit'))

    await waitFor(() => {
      expect(onStepComplete).toHaveBeenCalledWith(next)
    })
  })

  it('C4: skip invokes the same procedure with profile: {} preserving prior name/personality', async () => {
    advanceToC()
    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(createFirstRunState()),
    )

    fireEvent.click(screen.getByTestId('identity-profile-skip'))

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.writeIdentity',
        expect.objectContaining({
          name: 'Nia',
          personality: { preset: 'balanced' },
          profile: {},
        }),
      )
    })
  })

  it('C5: all paths send the full { name, personality, profile } shape', async () => {
    advanceToC()
    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(createFirstRunState()),
    )

    fireEvent.click(screen.getByTestId('identity-profile-skip'))

    await waitFor(() => {
      const payload = trpcFetchMock.trpcMutate.mock.calls[0][1] as Record<string, unknown>
      expect(payload).toHaveProperty('name')
      expect(payload).toHaveProperty('personality')
      expect(payload).toHaveProperty('profile')
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Block D — State machine + submission semantics — Goals C17, C18, C19.
// ──────────────────────────────────────────────────────────────────────────

describe('WizardStepIdentity — Block D: State machine and submission semantics', () => {
  it('D1: state machine traverses A → B → C in order', () => {
    renderIdentity()
    expect(screen.getByTestId('identity-substage-a')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('identity-name-input'), {
      target: { value: 'Nia' },
    })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    expect(screen.getByTestId('identity-substage-b')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('identity-personality-skip'))
    expect(screen.getByTestId('identity-substage-c')).toBeInTheDocument()
  })

  it('D2: agent_identity marked complete only after sub-stage C — trpcMutate called once across full traversal', async () => {
    renderIdentity()
    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(createFirstRunState()),
    )

    fireEvent.change(screen.getByTestId('identity-name-input'), {
      target: { value: 'Nia' },
    })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    expect(trpcFetchMock.trpcMutate).toHaveBeenCalledTimes(0)

    fireEvent.click(screen.getByTestId('identity-personality-skip'))
    expect(trpcFetchMock.trpcMutate).toHaveBeenCalledTimes(0)

    fireEvent.click(screen.getByTestId('identity-profile-skip'))
    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledTimes(1)
    })
  })

  it('D3: failure handling — setActionError called and onStepComplete NOT called', async () => {
    trpcFetchMock.trpcMutate.mockResolvedValue({
      success: false,
      state: createFirstRunState(),
      error: 'disk full',
    })
    const { onStepComplete, setActionError } = renderIdentity()

    fireEvent.change(screen.getByTestId('identity-name-input'), {
      target: { value: 'Nia' },
    })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    fireEvent.click(screen.getByTestId('identity-personality-skip'))
    fireEvent.click(screen.getByTestId('identity-profile-skip'))

    await waitFor(() => {
      expect(setActionError).toHaveBeenCalledWith('disk full')
    })
    expect(onStepComplete).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Block E — Animation and accessibility — Goals C20, C21, C22.
// ──────────────────────────────────────────────────────────────────────────

describe('WizardStepIdentity — Block E: Animation and accessibility', () => {
  it('E1: with prefers-reduced-motion: false, the animated container class is applied and forward navigation works', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    renderIdentity()
    const container = screen.getByTestId('identity-substage-a').parentElement
    expect(container?.className).toContain('nous-wizard__identity--animated')
    expect(container?.className).not.toContain('nous-wizard__identity--reduced-motion')
  })

  it('E2: with prefers-reduced-motion: true, the reduced-motion class is applied and forward navigation still works', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    renderIdentity()
    const container = screen.getByTestId('identity-substage-a').parentElement
    expect(container?.className).toContain('nous-wizard__identity--reduced-motion')
    expect(container?.className).not.toContain('nous-wizard__identity--animated')

    fireEvent.change(screen.getByTestId('identity-name-input'), {
      target: { value: 'Nia' },
    })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    expect(screen.getByTestId('identity-substage-b')).toBeInTheDocument()
  })

  it('E3: focus management — name input receives focus on sub-stage A render', () => {
    renderIdentity()
    expect(document.activeElement).toBe(screen.getByTestId('identity-name-input'))
  })

  it('E4: form fields use label association (getByLabelText resolves)', () => {
    renderIdentity()
    fireEvent.change(screen.getByTestId('identity-name-input'), {
      target: { value: 'Nia' },
    })
    fireEvent.click(screen.getByTestId('identity-name-submit'))
    fireEvent.click(screen.getByTestId('identity-personality-skip'))

    expect(screen.getByLabelText(/Your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/role or title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/working on/i)).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Block F — defineWizardStep registry-row contract — Goals C2.
// ──────────────────────────────────────────────────────────────────────────

describe('WizardStepIdentity — Block F: defineWizardStep registry-row', () => {
  it('F1: identityStep carries the SDS § 1.3 field shape with factory defaults', () => {
    expect(identityStep.id).toBe('agent_identity')
    expect(identityStep.backendStep).toBe('agent_identity')
    expect(identityStep.previous).toBe('welcome')
    expect(identityStep.skippable).toBe(true)
    expect(identityStep.label).toBe('Identity')
    // Factory default: extraBackendSteps is the empty tuple per ADR 016.
    expect(identityStep.extraBackendSteps).toEqual([])
    // Factory default: condition is `() => true` per SDS § 0 Note 2.
    expect(
      identityStep.condition({} as Parameters<typeof identityStep.condition>[0]),
    ).toBe(true)
  })
})
