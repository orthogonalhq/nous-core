'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { trpc } from '@/lib/trpc';
import { ProjectProvider } from '@/lib/project-context';
import { Button } from '@/components/ui/button';

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<main className="flex-1 overflow-auto">{children}</main>}>
      <ShellLayoutContent>{children}</ShellLayoutContent>
    </Suspense>
  );
}

function ShellLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
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
      setSidebarOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create project');
    }
  }, [createProject]);

  useEffect(() => {
    const linkedProjectId = searchParams.get('projectId');
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
    }
  }, [projectId, searchParams]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, searchParams]);

  return (
    <ProjectProvider value={{ projectId, setProjectId }}>
      <div className="flex h-screen overflow-hidden">
        <div className="hidden h-full shrink-0 md:block">
          <Sidebar
            projectId={projectId}
            onProjectSelect={setProjectId}
            onNewProject={handleNewProject}
          />
        </div>
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transition-transform md:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar
            projectId={projectId}
            onProjectSelect={setProjectId}
            onNewProject={handleNewProject}
            onNavigate={() => setSidebarOpen(false)}
            className="h-full w-full bg-background"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 md:hidden">
            <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
              Menu
            </Button>
            <div className="text-xs text-muted-foreground">
              {projectId ? 'Project selected' : 'No project selected'}
            </div>
          </div>
          <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </ProjectProvider>
  );
}
