'use client';

import * as React from 'react';
import { MaoOperatingSurface } from '@/components/mao/mao-operating-surface';

export default function MaoPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-8">
          <p className="text-muted-foreground">Loading MAO projection...</p>
        </div>
      }
    >
      <MaoOperatingSurface />
    </React.Suspense>
  );
}
