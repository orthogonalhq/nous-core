'use client'

import { MaoPanel } from '../../mao/MaoPanel'

/**
 * WR-162 SP 12 (SUPV-SP12-002) — Agents tab host.
 *
 * Replaces the SP 11 `AgentsTabPlaceholder` (which returned `null`).
 * Renders `<MaoPanel />` directly per V1 convention. `MaoPanel` accepts
 * no props (verified at SDS authorship — `MaoPanel.tsx:31` is
 * `export function MaoPanel()`); DNR-J2 render-contract preservation by
 * inheritance. `MaoPanel` self-wires from `useShellContext()` for
 * `activeProjectId`.
 */
export function AgentsTab() {
  return <MaoPanel />
}
