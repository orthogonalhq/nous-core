import * as React from 'react';
import type { MaoDensityMode } from '@nous/shared';

export interface InspectTarget {
  agentId: string | null;
  nodeDefinitionId: string | null;
  workflowRunId: string | null;
}

export interface UseTabStateReturn {
  densityMode: MaoDensityMode;
  setDensityMode: (mode: MaoDensityMode) => void;
  selectedTarget: InspectTarget | null;
  setSelectedTarget: (target: InspectTarget | null) => void;
  scrollPosition: number;
  setScrollPosition: (pos: number) => void;
}

/**
 * Per-tab state hook for the MAO Operating Surface.
 * Each tab (System / Projects) gets its own instance to isolate
 * density mode, selected agent, and scroll position.
 */
export function useTabState(initialDensity: MaoDensityMode = 'D2'): UseTabStateReturn {
  const [densityMode, setDensityMode] = React.useState<MaoDensityMode>(initialDensity);
  const [selectedTarget, setSelectedTarget] = React.useState<InspectTarget | null>(null);
  const [scrollPosition, setScrollPosition] = React.useState(0);

  // SUPV-SP1.17-006 — return identity stable when state values are content-stable; useState setters are identity-stable per React invariant (SUPV-SP1.17-021); SDS phase-1.17 Mechanism Choice row RC-B4.
  return React.useMemo<UseTabStateReturn>(() => ({
    densityMode,
    setDensityMode,
    selectedTarget,
    setSelectedTarget,
    scrollPosition,
    setScrollPosition,
  }), [densityMode, selectedTarget, scrollPosition]);
}
