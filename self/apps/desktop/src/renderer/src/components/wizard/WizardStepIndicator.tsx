import type { CSSProperties } from 'react'
import type { WizardStepDefinition, WizardStepId } from './types'

interface WizardStepIndicatorProps {
  steps: readonly WizardStepDefinition[]
  currentStepId: WizardStepId
}

export function WizardStepIndicator({
  steps,
  currentStepId,
}: WizardStepIndicatorProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId)

  // Bind the stepper grid column count to the registry length via a CSS
  // custom property. The `wizard.css` rule uses
  //   grid-template-columns: repeat(var(--nous-wizard-step-count, 4), ...)
  // so adding or removing a wizard step never requires a CSS edit.
  const stepperStyle = {
    '--nous-wizard-step-count': String(steps.length),
  } as CSSProperties

  return (
    <nav
      className="nous-wizard__stepper"
      aria-label="First-run wizard steps"
      style={stepperStyle}
    >
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId
        const isComplete = currentIndex > index
        const itemClassName = [
          'nous-wizard__stepper-item',
          isCurrent ? 'nous-wizard__stepper-item--current' : '',
          isComplete ? 'nous-wizard__stepper-item--complete' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={step.id} className={itemClassName}>
            <span className="nous-wizard__stepper-index">
              {isComplete ? '✓' : index + 1}
            </span>
            <span className="nous-wizard__stepper-label">{step.label}</span>
            <span className="nous-wizard__stepper-caption">
              {step.backendStep ?? 'UI-only'}
            </span>
          </div>
        )
      })}
    </nav>
  )
}
