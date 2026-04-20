/**
 * WizardStepIdentity — three-sub-stage identity setup (Naming → Personality → Profile).
 *
 * Sub-stage A (Naming): greeting prose + name input + submit. No skip.
 * Sub-stage B (Personality): preset cards iterating `PRESETS` from
 *   `@nous/cortex-core` in declared order, optional Advanced Options that
 *   surface every `TRAIT_REGISTRY` axis as a labeled control, explicit
 *   "Continue" submit, and skip → `{ preset: 'balanced' }` (NOT
 *   `{ preset: 'balanced', overrides: {} }`, per SDS § F12).
 * Sub-stage C (Profile): prompt prose + security disclosure + four optional
 *   form fields (`displayName`, `role`, `primaryUseCase`, `expertise`) +
 *   skip + submit + tRPC `firstRun.writeIdentity` + failure handling.
 *
 * Single batched submission per SDS § 3.2 / Goals C16: only sub-stage C
 * fires the tRPC call, with the full `{ name, personality, profile }`
 * payload. The `agent_identity` backend step transitions to `complete`
 * only after sub-stage C completes (submit or skip).
 *
 * SP 1.8 — entered field values (`name`, `personality`, `profile`,
 * `advancedOpen`) are lifted to the orchestrator (`FirstRunWizard`) via
 * `props.identityDraft` + `props.setIdentityDraft` so back-nav re-entry
 * into this step retains the values. `subStage` remains component-local
 * (SP 1.4 Goals item 11 — sub-stage progress is ephemeral; on remount the
 * component restarts at sub-stage A). Trace: SDS § 4.1 / Goals C1 / Plan
 * Task #1 / Invariant B.
 *
 * Animation: opacity fade between sub-stages, suppressed when
 * `prefers-reduced-motion: reduce` is set. The state machine is
 * decoupled from animation — forward navigation is synchronous on
 * setState, fade is purely cosmetic (SDS § F3, Invariant I12).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  PRESETS,
  TRAIT_REGISTRY,
  type PersonalityConfig,
  type PersonalityPreset,
  type TraitAxes,
} from '@nous/cortex-core/personality'
import { trpcMutate } from './trpc-fetch'
import type {
  FirstRunActionResult,
  ProfileFormState,
  WizardStepIdentityProps,
} from './types'

type SubStage = 'A' | 'B' | 'C'

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function buildProfilePayload(profile: ProfileFormState): ProfileFormState {
  // Drop empty-string fields so the persisted profile is `{}` when nothing
  // was filled. This mirrors the wizard-skip semantics for sub-stage C.
  const trimmed: ProfileFormState = {}
  if (profile.displayName && profile.displayName.trim() !== '') {
    trimmed.displayName = profile.displayName.trim()
  }
  if (profile.role && profile.role.trim() !== '') {
    trimmed.role = profile.role.trim()
  }
  if (profile.primaryUseCase && profile.primaryUseCase.trim() !== '') {
    trimmed.primaryUseCase = profile.primaryUseCase.trim()
  }
  if (profile.expertise) {
    trimmed.expertise = profile.expertise
  }
  return trimmed
}

interface WriteIdentityPayload {
  name: string
  personality: PersonalityConfig
  profile: ProfileFormState
}

export function WizardStepIdentity(props: WizardStepIdentityProps): ReactElement {
  const {
    actionInProgress,
    setActionInProgress,
    setActionError,
    onStepComplete,
    identityDraft,
    setIdentityDraft,
  } = props

  const [subStage, setSubStage] = useState<SubStage>('A')
  const reducedMotion = useMemo(() => detectReducedMotion(), [])
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  // Read the lifted entered-values draft from props.
  const { name, personality, profile, advancedOpen } = identityDraft

  // Focus management — name input on sub-stage A render.
  useEffect(() => {
    if (subStage === 'A') {
      nameInputRef.current?.focus()
    }
  }, [subStage])

  const advanceToB = () => {
    console.log('[nous:wizard:identity] Sub-stage A → B (name submitted)')
    setSubStage('B')
  }

  const handleNameSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') return
    advanceToB()
  }

  const handlePresetSelect = (presetId: PersonalityPreset) => {
    setIdentityDraft({
      ...identityDraft,
      personality: {
        preset: presetId,
        ...(personality.overrides ? { overrides: personality.overrides } : {}),
      },
    })
  }

  const handleOverrideSelect = (traitId: keyof TraitAxes, value: string) => {
    const nextOverrides: Partial<TraitAxes> = {
      ...personality.overrides,
      [traitId]: value,
    } as Partial<TraitAxes>
    setIdentityDraft({
      ...identityDraft,
      personality: {
        preset: personality.preset,
        overrides: nextOverrides,
      },
    })
  }

  const toggleAdvanced = () => {
    setIdentityDraft({ ...identityDraft, advancedOpen: !advancedOpen })
  }

  const handlePersonalityContinue = () => {
    const overrides = personality.overrides
    const hasOverrides = overrides && Object.keys(overrides).length > 0
    const nextPersonality: PersonalityConfig = hasOverrides
      ? { preset: personality.preset, overrides }
      : { preset: personality.preset }
    console.log(
      `[nous:wizard:identity] Sub-stage B → C (preset: ${nextPersonality.preset}; overrides: ${hasOverrides ? 'yes' : 'no'}; via: submit)`,
    )
    setIdentityDraft({ ...identityDraft, personality: nextPersonality })
    setSubStage('C')
  }

  const handlePersonalitySkip = () => {
    // F12 mitigation: skip writes exactly `{ preset: 'balanced' }` — NOT
    // `{ preset: 'balanced', overrides: {} }`. Empty overrides leak through
    // serialization and are observable downstream.
    console.log('[nous:wizard:identity] Sub-stage B → C (preset: balanced; overrides: no; via: skip)')
    setIdentityDraft({
      ...identityDraft,
      personality: { preset: 'balanced' as const },
    })
    setSubStage('C')
  }

  const submitIdentity = async (
    payload: WriteIdentityPayload,
    via: 'submit' | 'skip',
  ): Promise<void> => {
    setActionInProgress(true)
    setActionError(null)
    try {
      const result = await trpcMutate<FirstRunActionResult>('firstRun.writeIdentity', payload)
      if (result.success) {
        console.log(`[nous:wizard:identity] Sub-stage C completed (via: ${via})`)
        onStepComplete(result.state)
      } else {
        const message = result.error ?? 'Failed to write identity'
        console.log(`[nous:wizard:identity] Sub-stage C tRPC writeIdentity failed: ${message}`)
        setActionError(message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[nous:wizard:identity] Sub-stage C tRPC writeIdentity failed: ${message}`)
      setActionError(message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const profilePayload = buildProfilePayload(profile)
    void submitIdentity(
      { name, personality, profile: profilePayload },
      'submit',
    )
  }

  const handleProfileSkip = () => {
    void submitIdentity(
      { name, personality, profile: {} },
      'skip',
    )
  }

  const containerClassName = [
    'nous-wizard__identity',
    reducedMotion
      ? 'nous-wizard__identity--reduced-motion'
      : 'nous-wizard__identity--animated',
  ].join(' ')

  return (
    <div className={containerClassName} data-substage={subStage}>
      {subStage === 'A' ? (
        <section
          className="nous-wizard__card"
          data-testid="identity-substage-a"
          aria-labelledby="identity-substage-a-heading"
        >
          <h2 id="identity-substage-a-heading" className="nous-wizard__section-title">
            Naming
          </h2>
          <p className="nous-wizard__section-copy" data-testid="identity-greeting">
            Hi, I&rsquo;m Nous, your personal Agent. Today is the day I officially become yours.
          </p>
          <form onSubmit={handleNameSubmit} className="nous-wizard__stack">
            <label htmlFor="agent-name" className="nous-wizard__label">
              What would you like to call me?
            </label>
            <input
              id="agent-name"
              ref={nameInputRef}
              type="text"
              autoComplete="off"
              value={name}
              onChange={(event) => {
                const next = event.target.value
                setIdentityDraft({ ...identityDraft, name: next })
              }}
              className="nous-wizard__input"
              data-testid="identity-name-input"
            />
            <div className="nous-wizard__button-row">
              <button
                type="submit"
                className="nous-wizard__button nous-wizard__button--primary"
                disabled={name.trim() === '' || actionInProgress}
                data-testid="identity-name-submit"
              >
                Continue
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {subStage === 'B' ? (
        <section
          className="nous-wizard__card"
          data-testid="identity-substage-b"
          aria-labelledby="identity-substage-b-heading"
        >
          <h2 id="identity-substage-b-heading" className="nous-wizard__section-title">
            Personality
          </h2>
          <p className="nous-wizard__section-copy">
            Pick the personality that best matches how you want me to work. You can fine-tune individual traits later.
          </p>
          <div
            className="nous-wizard__option-list"
            role="radiogroup"
            aria-label="Personality preset"
          >
            {(Object.keys(PRESETS) as PersonalityPreset[]).map((presetId) => {
              const isSelected = personality.preset === presetId
              return (
                <button
                  key={presetId}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-preset-id={presetId}
                  data-testid="preset-card"
                  className={`nous-wizard__option${
                    isSelected ? ' nous-wizard__option--selected' : ''
                  }`}
                  onClick={() => handlePresetSelect(presetId)}
                >
                  <span className="nous-wizard__option-title">
                    {presetId.charAt(0).toUpperCase() + presetId.slice(1)}
                  </span>
                  <span className="nous-wizard__option-copy">
                    {describePreset(presetId)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="nous-wizard__stack">
            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--ghost"
              onClick={toggleAdvanced}
              data-testid="identity-advanced-toggle"
              aria-expanded={advancedOpen}
            >
              {advancedOpen ? 'Hide advanced options' : 'Advanced options'}
            </button>
            {advancedOpen ? (
              <div className="nous-wizard__stack" data-testid="identity-trait-list">
                {TRAIT_REGISTRY.map((trait) => {
                  const overrides = personality.overrides
                  const overrideValue = overrides
                    ? (overrides[trait.id as keyof TraitAxes] as string | undefined)
                    : undefined
                  const presetTraits = PRESETS[personality.preset]
                  const presetValue = presetTraits[trait.id as keyof TraitAxes]
                  const effectiveValue = overrideValue ?? presetValue
                  return (
                    <fieldset
                      key={trait.id}
                      className="nous-wizard__option"
                      data-trait-id={trait.id}
                    >
                      <legend className="nous-wizard__option-title">
                        {trait.label}
                      </legend>
                      <p className="nous-wizard__option-copy">
                        {trait.description}
                      </p>
                      <div className="nous-wizard__radio-row">
                        {Object.keys(trait.values).map((valueKey) => {
                          const valueDef = (trait.values as Record<string, { label: string; description: string }>)[valueKey]
                          const inputId = `trait-${trait.id}-${valueKey}`
                          return (
                            <label
                              key={valueKey}
                              htmlFor={inputId}
                              title={valueDef.description}
                            >
                              <input
                                id={inputId}
                                type="radio"
                                name={`trait-${trait.id}`}
                                value={valueKey}
                                checked={effectiveValue === valueKey}
                                onChange={() =>
                                  handleOverrideSelect(trait.id as keyof TraitAxes, valueKey)
                                }
                              />
                              <span>{valueDef.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="nous-wizard__button-row">
            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--primary"
              onClick={handlePersonalityContinue}
              disabled={actionInProgress}
              data-testid="identity-personality-submit"
            >
              Continue
            </button>
            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--ghost"
              onClick={handlePersonalitySkip}
              disabled={actionInProgress}
              data-testid="identity-personality-skip"
            >
              Skip
            </button>
          </div>
        </section>
      ) : null}

      {subStage === 'C' ? (
        <section
          className="nous-wizard__card"
          data-testid="identity-substage-c"
          aria-labelledby="identity-substage-c-heading"
        >
          <h2 id="identity-substage-c-heading" className="nous-wizard__section-title">
            About you
          </h2>
          <p className="nous-wizard__section-copy">
            To help me assist the best possible way, help me get to know you better. Every field is optional.
          </p>
          <section
            role="note"
            className="nous-wizard__disclosure"
            data-testid="identity-security-disclosure"
            aria-label="Privacy notice"
          >
            <p>Anything you share is stored locally on this device.</p>
            <p>It is used only to personalize how I respond to you.</p>
            <p>It is never sent externally without an explicit action you take.</p>
          </section>
          <form onSubmit={handleProfileSubmit} className="nous-wizard__stack">
            <label htmlFor="profile-display-name" className="nous-wizard__label">
              Your name (or what I should call you)
            </label>
            <input
              id="profile-display-name"
              type="text"
              autoComplete="given-name"
              value={profile.displayName ?? ''}
              onChange={(event) => {
                const next = event.target.value
                setIdentityDraft({
                  ...identityDraft,
                  profile: { ...profile, displayName: next },
                })
              }}
              className="nous-wizard__input"
            />

            <label htmlFor="profile-role" className="nous-wizard__label">
              Your role or title
            </label>
            <input
              id="profile-role"
              type="text"
              autoComplete="organization-title"
              value={profile.role ?? ''}
              onChange={(event) => {
                const next = event.target.value
                setIdentityDraft({
                  ...identityDraft,
                  profile: { ...profile, role: next },
                })
              }}
              className="nous-wizard__input"
            />

            <label htmlFor="profile-use-case" className="nous-wizard__label">
              What are you working on?
            </label>
            <textarea
              id="profile-use-case"
              autoComplete="off"
              value={profile.primaryUseCase ?? ''}
              onChange={(event) => {
                const next = event.target.value
                setIdentityDraft({
                  ...identityDraft,
                  profile: { ...profile, primaryUseCase: next },
                })
              }}
              className="nous-wizard__textarea"
              rows={3}
            />

            <fieldset className="nous-wizard__stack" data-testid="profile-expertise">
              <legend className="nous-wizard__label">
                How familiar are you with this domain?
              </legend>
              <div className="nous-wizard__radio-row">
                {(['beginner', 'intermediate', 'advanced'] as const).map((level) => {
                  const inputId = `profile-expertise-${level}`
                  return (
                    <label
                      key={level}
                      htmlFor={inputId}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name="profile-expertise"
                        value={level}
                        checked={profile.expertise === level}
                        onChange={() => {
                          setIdentityDraft({
                            ...identityDraft,
                            profile: { ...profile, expertise: level },
                          })
                        }}
                      />
                      <span>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="nous-wizard__button-row">
              <button
                type="submit"
                className="nous-wizard__button nous-wizard__button--primary"
                disabled={actionInProgress}
                data-testid="identity-profile-submit"
              >
                Continue
              </button>
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--ghost"
                onClick={handleProfileSkip}
                disabled={actionInProgress}
                data-testid="identity-profile-skip"
              >
                Skip
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  )
}

function describePreset(preset: PersonalityPreset): string {
  switch (preset) {
    case 'balanced':
      return 'A general-purpose default — concise, compliant, and standard in style.'
    case 'professional':
      return 'Detailed, careful, and verification-first — for serious work.'
    case 'efficient':
      return 'Concise and minimal — gets out of the way and ships.'
    case 'thorough':
      return 'Detailed and verification-first, but standard in style.'
    default:
      return ''
  }
}
