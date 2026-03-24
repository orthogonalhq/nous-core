'use client';

import * as React from 'react';
import { MaoOperatingSurface } from '@/components/mao/mao-operating-surface';

export default function MaoPage() {
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading MAO projection...</p>
        </div>
      }
    >
      <MaoOperatingSurface />
    </React.Suspense>
  );
}
