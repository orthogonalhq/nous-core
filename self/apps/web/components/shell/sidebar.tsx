'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NAV_CONFIG } from '@/lib/nav-config';
import { ThemeToggle } from './theme-toggle';

export function Sidebar({
  projectId,
  onProjectSelect,
  onNewProject,
}: {
  projectId: string | null;
  onProjectSelect: (id: string) => void;
  onNewProject: () => void;
}) {
  const pathname = usePathname();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border p-2">
        <span className="font-semibold">Nous</span>
        <ThemeToggle />
      </div>
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Projects</span>
              <Button variant="ghost" size="sm" onClick={onNewProject}>
                + New
              </Button>
            </div>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="space-y-0.5">
                {(projects ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onProjectSelect(p.id)}
                    className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                      projectId === p.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border p-2">
            <nav className="space-y-0.5">
              {NAV_CONFIG.items.map((item) =>
                item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded px-2 py-1.5 text-sm ${
                      pathname === item.href ? 'bg-muted font-medium' : 'hover:bg-muted'
                    }`}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
