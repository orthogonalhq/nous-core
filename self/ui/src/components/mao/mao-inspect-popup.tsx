'use client';

import * as React from 'react';
import type {
  GuardrailStatus,
  MaoAgentProjection,
  MaoProjectControlProjection,
  MaoProjectSnapshot,
  MaoProjectControlAction,
  MaoProjectControlResult,
  ProjectId,
  WitnessIntegrityStatus,
} from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
import { trpc } from '@nous/transport';
import {
  GUARDRAIL_SEVERITY,
  MaoInspectPanel,
  resolveSentinelBand,
  SENTINEL_RISK_BANDS,
  SEVERITY_TOKEN_TO_CSS_VAR,
  WITNESS_INTEGRITY_SEVERITY,
  type SeverityToken,
} from './mao-inspect-panel';
import { MaoProjectControls } from './mao-project-controls';
import { MaoAuditTrailPanel } from './mao-audit-trail-panel';

/**
 * SUPV-SP13-024 — Closed-form CSS animation for popup container; reduced-
 * motion via `@media (prefers-reduced-motion: reduce)`. Per
 * `feedback_no_heuristic_bandaids.md` "binary motion contract."
 */
const POPUP_STYLE_ID = 'mao-inspect-popup-motion';
const POPUP_CSS = `
[data-mao-popup-container] {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
  transform-origin: top center;
}
@media (prefers-reduced-motion: reduce) {
  [data-mao-popup-container] {
    transition: none;
    transform: none;
  }
}
`;

/**
 * SUPV-SP13-025 — Supervisor-state header resolution. Closed ordered
 * fall-through over the four severity bands; returns `null` when all three
 * supervisor fields are absent. Per `feedback_no_heuristic_bandaids.md`
 * "rank states by severity and show the worst — closed ordered fall-through."
 */
const SEVERITY_ORDER: ReadonlyArray<SeverityToken> = ['critical', 'high', 'medium', 'low'];

function resolveWorstSeverity(
  agent: MaoAgentProjection | null,
): SeverityToken | null {
  if (!agent) return null;
  const guardrail = (agent as { guardrail_status?: GuardrailStatus }).guardrail_status;
  const witness = (agent as { witness_integrity_status?: WitnessIntegrityStatus })
    .witness_integrity_status;
  const sentinel = (agent as { sentinel_risk_score?: number }).sentinel_risk_score;

  const tokens: SeverityToken[] = [];
  if (guardrail !== undefined) tokens.push(GUARDRAIL_SEVERITY[guardrail]);
  if (witness !== undefined) tokens.push(WITNESS_INTEGRITY_SEVERITY[witness]);
  if (sentinel !== undefined) tokens.push(resolveSentinelBand(sentinel));

  if (tokens.length === 0) return null;

  for (const order of SEVERITY_ORDER) {
    if (tokens.includes(order)) return order;
  }
  // SENTINEL_RISK_BANDS reference retained for module-cohesion check
  // (keeps tree-shaker from dropping the import; closed band-table is
  // SUPV-SP13-019).
  void SENTINEL_RISK_BANDS;
  return null;
}

export interface MaoInspectPopupProps {
  open: boolean;
  onClose: () => void;
  /** The agent being inspected */
  agent: MaoAgentProjection | null;
  /** Project snapshot for project controls (if available for the agent's project) */
  projectSnapshot: MaoProjectSnapshot | null;
  /** Optional project control projection for system-tab agents */
  projectControlProjection?: MaoProjectControlProjection | null;
  /** Control mutation pending state */
  controlPending?: boolean;
  /** Last control result */
  lastControlResult?: MaoProjectControlResult | null;
  /** Handler for control requests */
  onRequestControl?: (input: {
    action: MaoProjectControlAction;
    reason: string;
    commandId: string;
  }) => void;
  /** Resolve dispatching agent UUID to human-readable label */
  resolveAgentLabel?: (agentId: string) => string;
}

export function MaoInspectPopup({
  open,
  onClose,
  agent,
  projectSnapshot,
  projectControlProjection,
  controlPending = false,
  lastControlResult = null,
  onRequestControl,
  resolveAgentLabel,
}: MaoInspectPopupProps) {
  // Escape key handler
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Internal inspect query
  const inspectInput =
    agent != null
      ? {
          projectId: agent.project_id as ProjectId,
          agentId: agent.agent_id,
          workflowRunId: agent.workflow_run_id,
        }
      : undefined;

  const inspectQuery = trpc.mao.getAgentInspectProjection.useQuery(
    inspectInput as any,
    { enabled: open && agent != null },
  );

  // Derive effective project snapshot: use provided snapshot or construct
  // minimal from control projection. Restored per CR Note: SP 13 SDS
  // SUPV-SP13-026 ("popup body has no destructive control") was found at
  // verify-time to conflict with the existing `mao-page.test.tsx`
  // contract that mounts the popup-rendered MaoProjectControls; SC-22 +
  // SC-31 require both the test and the web app to remain unchanged. The
  // DNR-C3 reinforcement landed via the SP 13 NEW UT-SP13-DNR-C3 +
  // UT-SP13-DNR-C3-POPUP-* tests verifying that SP 13 polish does NOT add
  // any new destructive control surface; existing MaoProjectControls
  // visibility (DNR-F1) is preserved.
  const effectiveProjectSnapshot = React.useMemo<MaoProjectSnapshot | null>(() => {
    if (projectSnapshot) return projectSnapshot;
    if (
      !projectControlProjection ||
      !agent ||
      agent.project_id === SYSTEM_SCOPE_SENTINEL_PROJECT_ID
    ) {
      return null;
    }
    return {
      projectId: agent.project_id,
      densityMode: 'D2',
      controlProjection: projectControlProjection,
      grid: [],
      graph: {
        projectId: agent.project_id,
        nodes: [],
        edges: [],
        generatedAt: new Date().toISOString(),
      },
      urgentOverlay: {
        urgentAgentIds: [],
        blockedAgentIds: [],
        generatedAt: new Date().toISOString(),
      },
      summary: {
        activeAgentCount: projectControlProjection.active_agent_count,
        blockedAgentCount: projectControlProjection.blocked_agent_count,
        failedAgentCount: 0,
        waitingPfcAgentCount: 0,
        urgentAgentCount: projectControlProjection.urgent_agent_count,
      },
      diagnostics: { runtimePosture: 'single_process_local' as const },
      generatedAt: new Date().toISOString(),
    } as MaoProjectSnapshot;
  }, [projectSnapshot, projectControlProjection, agent]);

  // SUPV-SP13-024 — Focus targeting on open. Programmatic focus to the
  // popup container ensures keyboard users land in the dialog. Container
  // has `tabIndex={-1}` for programmatic focus.
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (open) {
      containerRef.current?.focus();
    }
  }, [open]);

  // SUPV-SP13-025 — Worst-severity supervisor token (used in header).
  const worstSeverity = React.useMemo(() => resolveWorstSeverity(agent), [agent]);

  if (!open) return null;

  return (
    <div
      data-testid="inspect-popup"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: 'inherit',
      }}
    >
      <style data-style-id={POPUP_STYLE_ID}>{POPUP_CSS}</style>
      {/* Backdrop */}
      <div
        onClick={onClose}
        data-testid="inspect-popup-backdrop"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Popup container */}
      <div
        ref={containerRef}
        tabIndex={-1}
        data-mao-popup-container="present"
        data-testid="inspect-popup-container"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '42rem',
          maxHeight: 'calc(100% - 2rem)',
          margin: '1rem',
          overflowY: 'auto',
          borderRadius: 'var(--nous-radius-xl, 12px)',
          border: '1px solid var(--nous-border)',
          background: 'var(--nous-bg-surface, var(--nous-bg))',
          padding: 'var(--nous-space-3xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          outline: 'none',
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspect popup"
          data-testid="inspect-popup-close"
          style={{
            position: 'absolute',
            right: 'var(--nous-space-lg)',
            top: 'var(--nous-space-lg)',
            padding: 'var(--nous-space-xs)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--nous-text-secondary)',
            borderRadius: 'var(--nous-radius-sm, 4px)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-3xl)', paddingTop: 'var(--nous-space-sm)' }}>
          {/*
            * SUPV-SP13-025 — Supervisor-state header at the popup top.
            * Renders only when at least one supervisor field on the inspected
            * agent maps to a severity token; absent → render NOTHING (HF-019
            * binding mirrors inspect-panel SUPV-SP13-018).
            */}
          {worstSeverity !== null ? (
            <header
              data-testid="mao-supervisor-header"
              data-mao-supervisor-header="present"
              data-mao-severity={worstSeverity}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--nous-space-sm)',
                padding: 'var(--nous-space-sm) var(--nous-space-md)',
                borderRadius: 'var(--nous-radius-sm)',
                border: `1px solid ${SEVERITY_TOKEN_TO_CSS_VAR[worstSeverity]}`,
                color: SEVERITY_TOKEN_TO_CSS_VAR[worstSeverity],
                fontSize: 'var(--nous-font-size-sm)',
                fontWeight: 500,
              }}
            >
              <span aria-hidden="true">●</span>
              <span>Supervisor state: {worstSeverity}</span>
            </header>
          ) : null}

          <MaoInspectPanel
            inspect={inspectQuery.data}
            isLoading={inspectQuery.isLoading}
            resolveAgentLabel={resolveAgentLabel}
          />

          {/*
            * SUPV-SP13-026 — DNR-C3 preservation. SP 13 polish does NOT add
            * any new destructive control surface to the popup; the existing
            * MaoProjectControls path is preserved per DNR-F1 ("three project
            * controls present"). UT-SP13-POPUP-DNR-C3 verifies that SP 13's
            * polish itself introduces no new destructive controls beyond the
            * existing MaoProjectControls component (which remains under its
            * dedicated test suite + the existing mao-page integration test).
            */}
          {effectiveProjectSnapshot && onRequestControl ? (
            <MaoProjectControls
              snapshot={effectiveProjectSnapshot}
              pending={controlPending}
              lastResult={lastControlResult ?? null}
              onRequestControl={onRequestControl}
            />
          ) : null}

          <MaoAuditTrailPanel
            projectId={(agent?.project_id as ProjectId) ?? null}
          />
        </div>
      </div>
    </div>
  );
}
