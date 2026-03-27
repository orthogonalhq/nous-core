'use client';

/**
 * @deprecated Replaced by NavigationRail in SP 1.2.
 * Retained for potential mobile fallback until NavigationRail responsive behavior is verified.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Button, ScrollArea } from '@nous/ui';
import { NAV_CONFIG } from '@/lib/nav-config';
import { ThemeToggle } from './theme-toggle';

export function Sidebar({
  projectId,
  onProjectSelect,
  onNewProject,
  onNavigate,
  className,
}: {
  projectId: string | null;
  onProjectSelect: (id: string) => void;
  onNewProject: () => void;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  return (
    <aside
      className={className}
      style={{
        display: 'flex',
        height: '100%',
        width: '14rem',
        flexDirection: 'column',
        borderRight: '1px solid var(--nous-shell-column-border)',
        background: 'var(--nous-bg-hover)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--nous-shell-column-border)',
          padding: 'var(--nous-space-xs)',
        }}
      >
        <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' }}>Nous</span>
        <ThemeToggle />
      </div>
      <div
        style={{
          flex: '1 1 0%',
          overflow: 'hidden',
        }}
      >
        <ScrollArea style={{ height: '100%' }}>
          <div style={{ padding: 'var(--nous-space-xs)' }}>
            <div
              style={{
                marginBottom: 'var(--nous-space-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--nous-font-size-xs)',
                  fontWeight: 'var(--nous-font-weight-medium)',
                  color: 'var(--nous-text-secondary)',
                }}
              >
                Projects
              </span>
              <Button variant="ghost" size="sm" onClick={onNewProject}>
                + New
              </Button>
            </div>
            {isLoading ? (
              <div
                style={{
                  fontSize: 'var(--nous-font-size-sm)',
                  color: 'var(--nous-text-secondary)',
                }}
              >
                Loading...
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {(projects ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onProjectSelect(p.id);
                      onNavigate?.();
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      border: 'none',
                      borderRadius: 'var(--nous-radius-sm)',
                      padding: '6px var(--nous-space-xs)',
                      textAlign: 'left',
                      fontSize: 'var(--nous-font-size-sm)',
                      cursor: 'pointer',
                      ...(projectId === p.id
                        ? {
                            background: 'var(--nous-accent)',
                            color: 'var(--nous-fg-on-color)',
                          }
                        : {
                            background: 'transparent',
                            color: 'var(--nous-text-primary)',
                          }),
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div
            style={{
              borderTop: '1px solid var(--nous-shell-column-border)',
              padding: 'var(--nous-space-xs)',
            }}
          >
            <nav
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {NAV_CONFIG.items.map((item) =>
                item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onNavigate?.()}
                    style={{
                      display: 'block',
                      borderRadius: 'var(--nous-radius-sm)',
                      padding: '6px var(--nous-space-xs)',
                      fontSize: 'var(--nous-font-size-sm)',
                    }}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onNavigate?.()}
                    style={{
                      display: 'block',
                      borderRadius: 'var(--nous-radius-sm)',
                      padding: '6px var(--nous-space-xs)',
                      fontSize: 'var(--nous-font-size-sm)',
                      ...(pathname === item.href
                        ? {
                            background: 'var(--nous-bg-hover)',
                            fontWeight: 'var(--nous-font-weight-medium)',
                          }
                        : {}),
                    }}
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
