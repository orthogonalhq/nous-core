'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProject } from '@/lib/project-context';
import { TracesContent } from './traces-content';

export default function TracesPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading traces...</p>
        </div>
      }
    >
      <TracesPageContent />
    </Suspense>
  );
}

function TracesPageContent() {
  const { projectId } = useProject();
  const searchParams = useSearchParams();
  const traceId = searchParams.get('traceId');

  return <TracesContent projectId={projectId} traceId={traceId} />;
}
