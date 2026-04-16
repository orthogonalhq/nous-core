import {
  formatLifecycleState,
  type WizardStepProps,
} from './types'

export interface WizardStepWelcomeProps extends WizardStepProps {
  onContinue: () => void
}

function formatMemoryLabel(memoryMB: number): string {
  const memoryGB = memoryMB / 1024
  return `${memoryGB.toFixed(memoryGB >= 10 ? 0 : 1)} GB`
}

export function WizardStepWelcome({
  prerequisites,
  onContinue,
}: WizardStepWelcomeProps) {
  const hardware = prerequisites?.hardware
  const ollama = prerequisites?.ollama

  return (
    <div className="nous-wizard__stack">
      <section className="nous-wizard__hero">
        <div className="nous-wizard__eyebrow">Desktop Self-Hosted Runtime</div>
        <h1 className="nous-wizard__title">Set up your local runtime in a few guided steps.</h1>
        <p className="nous-wizard__subtitle">
          This first-run flow checks your hardware, helps you get Ollama running,
          downloads a recommended model, and assigns that model to the core Nous
          roles for this desktop workspace.
        </p>

        <div className="nous-wizard__button-row">
          <button
            type="button"
            className="nous-wizard__button nous-wizard__button--primary"
            onClick={onContinue}
          >
            Continue setup
          </button>
        </div>
      </section>

      <div className="nous-wizard__grid">
        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">System snapshot</h2>
          <p className="nous-wizard__section-copy">
            The backend has already collected the basics we need for the wizard.
            You can keep moving even if Ollama is not installed yet.
          </p>

          <div className="nous-wizard__meta-list">
            <div className="nous-wizard__meta-item">
              <span className="nous-wizard__meta-label">Memory</span>
              <span className="nous-wizard__meta-value">
                {hardware ? formatMemoryLabel(hardware.totalMemoryMB) : 'Loading…'}
              </span>
            </div>
            <div className="nous-wizard__meta-item">
              <span className="nous-wizard__meta-label">CPU</span>
              <span className="nous-wizard__meta-value">
                {hardware
                  ? `${hardware.cpuModel} (${hardware.cpuCores} cores)`
                  : 'Loading…'}
              </span>
            </div>
            <div className="nous-wizard__meta-item">
              <span className="nous-wizard__meta-label">GPU</span>
              <span className="nous-wizard__meta-value">
                {hardware
                  ? hardware.gpu.detected
                    ? `${hardware.gpu.name ?? 'Detected'}${hardware.gpu.vramMB ? ` (${formatMemoryLabel(hardware.gpu.vramMB)})` : ''}`
                    : 'No dedicated GPU detected'
                  : 'Loading…'}
              </span>
            </div>
          </div>
        </section>

        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Ollama readiness</h2>
          <p className="nous-wizard__section-copy">
            The next step focuses on Ollama, the local model runtime used by this
            desktop flow.
          </p>

          <div
            className={`nous-wizard__status ${
              ollama?.state === 'running'
                ? 'nous-wizard__status--running'
                : ollama
                  ? 'nous-wizard__status--warning'
                  : 'nous-wizard__status--action'
            }`}
          >
            <span className="nous-wizard__status-dot" />
            <span>
              {ollama ? formatLifecycleState(ollama.state) : 'Checking Ollama status…'}
            </span>
          </div>

          <div className="nous-wizard__divider" />

          <div className="nous-wizard__summary-list">
            <div className="nous-wizard__summary-item">
              <span>Available models</span>
              <span>{ollama ? ollama.models.length : 0}</span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Default model</span>
              <span>{ollama?.defaultModel ?? 'None yet'}</span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Next action</span>
              <span>Install or start Ollama</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
