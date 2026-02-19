'use client';

import { useState, useCallback } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { trpc } from '@/lib/trpc';
import { ProjectProvider } from '@/lib/project-context';

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
  });

  const handleNewProject = useCallback(async () => {
    const name = prompt('Project name:');
    if (!name?.trim()) return;
    try {
      const project = await createProject.mutateAsync({ name: name.trim() });
      setProjectId(project.id);
    } catch (err) {
      console.error(err);
      alert('Failed to create project');
    }
  }, [createProject]);

  return (
    <ProjectProvider value={{ projectId, setProjectId }}>
      <div className="flex h-screen">
        <Sidebar
          projectId={projectId}
          onProjectSelect={setProjectId}
          onNewProject={handleNewProject}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </ProjectProvider>
  );
}
