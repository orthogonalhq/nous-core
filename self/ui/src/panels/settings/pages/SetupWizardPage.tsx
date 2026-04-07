'use client'

import { useState } from 'react'
import type { PreferencesApi, FeedbackState } from '../types'
import { sectionStyle, sectionTitleStyle, cardStyle, btnStyle, helperTextStyle, feedbackStyle } from '../styles'
import { formatFeedbackError } from './helpers'
import { ConfirmDeleteDialog } from '../../../components'

export interface SetupWizardPageProps {
  api: Pick<PreferencesApi, 'resetWizard'>
  onWizardReset?: () => void | Promise<void>
}

export function SetupWizardPage({ api, onWizardReset }: SetupWizardPageProps) {
  const [resettingWizard, setResettingWizard] = useState(false)
  const [wizardFeedback, setWizardFeedback] = useState<FeedbackState | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const hasResetWizard = typeof api.resetWizard === 'function'

  const handleResetWizard = async () => {
    if (!api.resetWizard || resettingWizard) {
      return
    }

    setResettingWizard(true)
    setWizardFeedback(null)

    try {
      await api.resetWizard()
      setWizardFeedback({
        message: 'Setup wizard reset. Returning to onboarding...',
        success: true,
      })
      await onWizardReset?.()
    } catch (err) {
      setWizardFeedback(formatFeedbackError(err))
    } finally {
      setResettingWizard(false)
    }
  }

  return (
    <div data-testid="settings-page-setup-wizard">
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Setup Wizard</div>

        <div style={cardStyle}>
          <div
            style={{
              fontSize: 'var(--nous-font-size-base)',
              fontWeight: 'var(--nous-font-weight-semibold)' as never,
              color: 'var(--nous-fg)',
              marginBottom: 'var(--nous-space-xs)',
            }}
          >
            Re-run local setup
          </div>
          <div style={{ ...helperTextStyle, marginBottom: 'var(--nous-space-md)' }}>
            {hasResetWizard
              ? 'Use this if your hardware changed, you want to reconfigure providers from scratch, or you need to troubleshoot the onboarding flow again.'
              : 'The setup wizard reset function is not available in this environment.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              style={{
                ...btnStyle('ghost'),
                opacity: !hasResetWizard || resettingWizard ? 0.5 : 1,
                cursor: !hasResetWizard || resettingWizard ? 'not-allowed' : 'pointer',
              }}
              onClick={() => setShowResetConfirm(true)}
              disabled={!hasResetWizard || resettingWizard}
            >
              {resettingWizard ? 'Resetting...' : 'Re-run Setup Wizard'}
            </button>
          </div>
        </div>

        {wizardFeedback && (
          <div style={feedbackStyle(wizardFeedback.success)}>
            {wizardFeedback.message}
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        isOpen={showResetConfirm}
        onConfirm={() => {
          setShowResetConfirm(false)
          handleResetWizard()
        }}
        onCancel={() => setShowResetConfirm(false)}
        itemName="Setup Wizard"
        confirmWord="RESET"
        title="Reset Setup Wizard?"
        description="This will reset the onboarding flow so you can reconfigure your local runtime from scratch. Type RESET to confirm."
      />
    </div>
  )
}
