'use client';

import { MemoryInspector } from '@/components/memory/memory-inspector';
import { useProject } from '@/lib/project-context';

export default function MemoryPage() {
  const { projectId } = useProject();

  if (!projectId) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-4xl)',
        }}
      >
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          Select a project from the sidebar to inspect memory.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--nous-space-4xl)' }}>
      <MemoryInspector projectId={projectId} />
    </div>
  );
}
