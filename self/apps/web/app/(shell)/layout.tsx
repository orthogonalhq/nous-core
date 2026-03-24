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
    <Suspense
      fallback={(
        <main
          style={{
            flex: '1 1 0%',
            overflow: 'auto',
          }}
        >
          {children}
        </main>
      )}
    >
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
      <div
        style={{
          display: 'flex',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: sidebarOpen ? 'none' : 'block',
            height: '100%',
            flexShrink: 0,
          }}
        >
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
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background: 'rgba(0, 0, 0, 0.4)',
            }}
          />
        ) : null}
        <div
          style={{
            position: 'fixed',
            insetBlock: 0,
            left: 0,
            zIndex: 50,
            width: '18rem',
            transition: 'transform 0.2s ease',
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          }}
        >
          <Sidebar
            projectId={projectId}
            onProjectSelect={setProjectId}
            onNewProject={handleNewProject}
            onNavigate={() => setSidebarOpen(false)}
            className="web-shell-sidebar"
          />
        </div>
        <div
          style={{
            display: 'flex',
            minWidth: 0,
            flex: '1 1 0%',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--nous-shell-column-border)',
              padding: 'var(--nous-space-sm) var(--nous-space-md)',
            }}
          >
            <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
              Menu
            </Button>
            <div
              style={{
                fontSize: 'var(--nous-font-size-xs)',
                color: 'var(--nous-text-secondary)',
              }}
            >
              {projectId ? 'Project selected' : 'No project selected'}
            </div>
          </div>
          <main
            style={{
              minHeight: 0,
              flex: '1 1 0%',
              overflow: 'auto',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </ProjectProvider>
  );
}
