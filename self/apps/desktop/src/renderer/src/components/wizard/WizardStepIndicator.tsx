import type { WizardStepDefinition, WizardStepId } from './types'

interface WizardStepIndicatorProps {
  steps: WizardStepDefinition[]
  currentStepId: WizardStepId
}

export function WizardStepIndicator({
  steps,
  currentStepId,
}: WizardStepIndicatorProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId)

  return (
    <nav className="nous-wizard__stepper" aria-label="First-run wizard steps">
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
