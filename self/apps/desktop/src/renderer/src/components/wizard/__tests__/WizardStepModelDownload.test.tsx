/**
 * SP 1.8 Fix #13 — `WizardStepModelDownload` Tier-1 + Tier-2 tests.
 *
 * Tier-1: explanatory section renders detected RAM/CPU/GPU/tier label
 * when `prerequisites.hardware` and `prerequisites.recommendations.tierLabel`
 * are populated (Goals C11; new file per Plan Verification Sweep 5).
 *
 * Tier-2 (RC-2a regression): when `validation['ollama:qwen2.5:32b'] === 'validated'`,
 * the corresponding card renders the `validated` indicator. Regresses
 * the four-state validation vocabulary contract for the cross-axis
 * derivation case.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WizardStepModelDownload } from '../WizardStepModelDownload'
import {
  createElectronAPIMock,
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

function renderStep(
  prerequisitesOverrides: Parameters<typeof createPrerequisites>[0] = {},
) {
  installMock()
  return render(
    <WizardStepModelDownload
      state={createFirstRunState()}
      prerequisites={createPrerequisites(prerequisitesOverrides)}
      selectedModelSpec={null}
      setSelectedModelSpec={vi.fn()}
      actionInProgress={false}
      actionError={null}
      setActionInProgress={vi.fn()}
      setActionError={vi.fn()}
      onStepComplete={vi.fn()}
    />,
  )
}

beforeEach(() => {
  trpcFetchMock.trpcMutate.mockReset()
  trpcFetchMock.trpcQuery.mockReset()
})

describe('WizardStepModelDownload — SP 1.8 explanatory section (Tier-1)', () => {
  it('renders detected RAM, CPU cores, GPU presence + name, and tier label when populated', () => {
    renderStep({
      recommendations: {
        ...createPrerequisites().recommendations,
        tier: 'large',
        tierLabel: 'High-spec (advanced reasoning)',
      },
    })

    const ramRow = screen.getByTestId('wizard-hardware-ram')
    const cpuRow = screen.getByTestId('wizard-hardware-cpu')
    const gpuRow = screen.getByTestId('wizard-hardware-gpu')
    const tierRow = screen.getByTestId('wizard-hardware-tier')

    // 32768 MB → 32 GB.
    expect(ramRow.textContent).toContain('32 GB')
    expect(cpuRow.textContent).toContain('12')
    expect(gpuRow.textContent).toContain('Detected')
    expect(gpuRow.textContent).toContain('RTX 4080')
    expect(tierRow.textContent).toContain('High-spec (advanced reasoning)')

    const tierLink = screen.getByTestId('wizard-hardware-tier-link')
    expect(tierLink.textContent).toContain('High-spec (advanced reasoning)')
  })

  it('omits the hardware summary when prerequisites are not yet loaded', () => {
    installMock()
    render(
      <WizardStepModelDownload
        state={createFirstRunState()}
        prerequisites={null}
        selectedModelSpec={null}
        setSelectedModelSpec={vi.fn()}
        actionInProgress={false}
        actionError={null}
        setActionInProgress={vi.fn()}
        setActionError={vi.fn()}
        onStepComplete={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('wizard-hardware-summary')).toBeNull()
  })
})

describe('WizardStepModelDownload — RC-2a four-state vocabulary regression (Tier-2)', () => {
  it('renders the "Available" indicator when validation map marks the spec as validated', () => {
    renderStep({
      validation: {
        'ollama:qwen2.5:7b': 'validated',
      },
      recommendations: {
        ...createPrerequisites().recommendations,
        tier: 'medium',
        tierLabel: 'Mid-spec (stronger reasoning)',
      },
    })

    // The single-model recommendation in the default fixture is qwen2.5:7b.
    // Its card should render the "Available" validation label.
    const labels = screen.getAllByText('Available')
    expect(labels.length).toBeGreaterThanOrEqual(1)
  })
})
