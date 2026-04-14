'use client';

import type { IDockviewPanelProps } from 'dockview-react';
import { MaoPanel } from '@nous/ui/components';

/**
 * Dockview panel wrapper for the app-agnostic MaoPanel.
 * All project context, transport, and service bindings are handled
 * by MaoPanel in @nous/ui — this is pure chrome.
 */
export function DesktopMaoPanel(_props: IDockviewPanelProps) {
  return (
    <div style={{ height: '100%' }}>
      <MaoPanel />
    </div>
  );
}
