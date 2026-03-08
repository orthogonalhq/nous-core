'use client';

import { MemoryInspector } from '@/components/memory/memory-inspector';
import { useProject } from '@/lib/project-context';

export default function MemoryPage() {
  const { projectId } = useProject();

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project from the sidebar to inspect memory.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <MemoryInspector projectId={projectId} />
    </div>
  );
}
