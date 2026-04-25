'use client';

/**
 * `RecoveryStateBanner` — dismissible success banner for the
 * `recovery_completed` `RecoveryTerminalState` value.
 *
 * Per Decision #9 §9a:
 * - Banner is passively observable; dismissal is UI-local React state and
 *   does not mutate run state.
 * - No opctl command on dismiss; no proof flow; no witness emission.
 *
 * WR-162 SP 10 — see SDS § Invariants SUPV-SP10-001 + SUPV-SP10-005.
 */
import * as React from 'react';
import type { RecoveryTerminalStateFixture } from './recovery-terminal-state-fixture';

export interface RecoveryStateBannerProps {
  fixture: Extract<
    RecoveryTerminalStateFixture,
    { state: 'recovery_completed' }
  >;
  /**
   * Optional handler for the run-detail link. Host-injected per SUPV-SP10-001.
   * SP 10 does not navigate; the host (SP 13 / SP 14) wires the handler.
   */
  onOpenRunDetail?: (runId: string) => void;
}

export function RecoveryStateBanner({
  fixture,
  onOpenRunDetail,
}: RecoveryStateBannerProps): React.ReactElement | null {
  // SUPV-SP10-005 — UI-local dismissal; per-mount React state.
  // No localStorage; no sessionStorage; no React context; no global store.
  const [dismissed, setDismissed] = React.useState<boolean>(false);
  if (dismissed) return null;
  return (
    <div role="status" aria-live="polite" data-recovery-banner="completed">
      <p>{fixture.outcomeSummary}</p>
      {onOpenRunDetail !== undefined && (
        <button
          type="button"
          onClick={() => onOpenRunDetail(fixture.runId)}
          data-recovery-banner-action="run-detail"
        >
          View run detail
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss recovery success banner"
        onClick={() => setDismissed(true)}
        data-recovery-banner-action="dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
