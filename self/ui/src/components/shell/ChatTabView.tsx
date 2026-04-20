'use client'

import { useState, useMemo } from 'react'
import { MessageSquare, Plus, ChevronLeft } from 'lucide-react'
import { trpc } from '@nous/transport'
import { useListSessions, useChatApi } from '@nous/transport'
import { ChatPanel } from '../../panels/ChatPanel'
import type { ContentRouterRenderProps } from './ContentRouter'
import { useShellContext } from './ShellContext'

// ---------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------

type ViewState =
  | { view: 'home' }
  | { view: 'project'; projectId: string; projectName: string }
  | { view: 'session'; projectId: string; projectName: string; sessionId: string }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatTabView(_props: ContentRouterRenderProps) {
  const shell = useShellContext()
  const { data: projects } = trpc.projects.list.useQuery()

  // Initialize to project view when a project is active (BT Round 1, RC-3)
  const [viewState, setViewState] = useState<ViewState>(() => {
    if (shell.activeProjectId) {
      return { view: 'project', projectId: shell.activeProjectId, projectName: '' }
    }
    return { view: 'home' }
  })

  // Resolve project name once projects load (initial state may have empty name)
  const resolvedViewState = useMemo(() => {
    if (viewState.view === 'project' && !viewState.projectName && projects) {
      const proj = projects.find((p: { id: string }) => p.id === viewState.projectId)
      if (proj) {
        return { ...viewState, projectName: (proj as { id: string; name?: string }).name ?? viewState.projectId }
      }
    }
    return viewState
  }, [viewState, projects])

  switch (resolvedViewState.view) {
    case 'home':
      return (
        <HomeView
          onSelectProject={(id, name) =>
            setViewState({ view: 'project', projectId: id, projectName: name })
          }
        />
      )
    case 'project':
      return (
        <ProjectView
          projectId={resolvedViewState.projectId}
          projectName={resolvedViewState.projectName}
          onBack={() => setViewState({ view: 'home' })}
          onSelectSession={(sessionId) =>
            setViewState({
              view: 'session',
              projectId: resolvedViewState.projectId,
              projectName: resolvedViewState.projectName,
              sessionId,
            })
          }
          onNewChat={() =>
            setViewState({
              view: 'session',
              projectId: resolvedViewState.projectId,
              projectName: resolvedViewState.projectName,
              sessionId: crypto.randomUUID(),
            })
          }
        />
      )
    case 'session':
      return (
        <SessionView
          projectId={resolvedViewState.projectId}
          projectName={resolvedViewState.projectName}
          sessionId={resolvedViewState.sessionId}
          onBack={() =>
            setViewState({
              view: 'project',
              projectId: resolvedViewState.projectId,
              projectName: resolvedViewState.projectName,
            })
          }
        />
      )
  }
}

// ---------------------------------------------------------------------------
// Home View
// ---------------------------------------------------------------------------

function HomeView({
  onSelectProject,
}: {
  onSelectProject: (projectId: string, projectName: string) => void
}) {
  const { data: projects, isLoading } = trpc.projects.list.useQuery()

  return (
    <div style={styles.container}>
      <div style={styles.sectionHeader}>
        <MessageSquare size={16} />
        <span>Chat</span>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionLabel}>PROJECTS</div>
        {isLoading ? (
          <div style={styles.emptyState}>Loading projects...</div>
        ) : !projects?.length ? (
          <div style={styles.emptyState}>No projects yet.</div>
        ) : (
          projects.map((p: { id: string; name?: string }) => (
            <button
              key={p.id}
              type="button"
              style={styles.listItem}
              onClick={() => onSelectProject(p.id, p.name ?? p.id)}
            >
              <MessageSquare size={14} style={{ opacity: 0.5 }} />
              <span style={styles.listItemLabel}>{p.name ?? p.id}</span>
              <ChevronLeft size={14} style={{ transform: 'rotate(180deg)', opacity: 0.3 }} />
            </button>
          ))
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionLabel}>RECENT CONVERSATIONS</div>
        <div style={styles.emptyState}>
          No conversations yet. Select a project to start chatting.
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project View
// ---------------------------------------------------------------------------

function ProjectView({
  projectId,
  projectName,
  onBack,
  onSelectSession,
  onNewChat,
}: {
  projectId: string
  projectName: string
  onBack: () => void
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
}) {
  const { data: sessions, isLoading } = useListSessions(projectId)

  return (
    <div style={styles.container}>
      <button type="button" style={styles.backButton} onClick={onBack}>
        <ChevronLeft size={14} />
        <span>Back</span>
      </button>

      <div style={styles.sectionHeader}>
        <MessageSquare size={16} />
        <span>{projectName}</span>
      </div>

      <button type="button" style={styles.newChatButton} onClick={onNewChat}>
        <Plus size={14} />
        <span>New Chat</span>
      </button>

      <div style={styles.section}>
        <div style={styles.sectionLabel}>CONVERSATIONS</div>
        {isLoading ? (
          <div style={styles.emptyState}>Loading sessions...</div>
        ) : !sessions?.length ? (
          <div style={styles.emptyState}>
            No conversations yet. Click "New Chat" to start one.
          </div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              style={styles.listItem}
              onClick={() => onSelectSession(s.sessionId)}
            >
              <MessageSquare size={14} style={{ opacity: 0.5 }} />
              <span style={styles.listItemLabel}>
                {s.firstMessage || 'New conversation'}
              </span>
              <span style={styles.timestamp}>
                {formatRelativeTime(s.lastTimestamp)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session View
// ---------------------------------------------------------------------------

function SessionView({
  projectId,
  projectName,
  sessionId,
  onBack,
}: {
  projectId: string
  projectName: string
  sessionId: string
  onBack: () => void
}) {
  const chatApi = useChatApi({ projectId, sessionId })

  return (
    <div style={styles.sessionContainer}>
      <button type="button" style={styles.backButton} onClick={onBack}>
        <ChevronLeft size={14} />
        <span>Back to {projectName}</span>
      </button>
      <ChatPanel chatApi={chatApi} className="flex-1" stage="full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    padding: 'var(--nous-space-xl)',
    gap: 'var(--nous-space-lg)',
    color: 'var(--nous-fg)',
  },
  sessionContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    color: 'var(--nous-fg)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--nous-space-sm)',
    fontSize: 'var(--nous-font-size-lg)',
    fontWeight: 600,
    padding: 'var(--nous-space-sm) 0',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--nous-space-xs)',
  },
  sectionLabel: {
    fontSize: 'var(--nous-font-size-xs)',
    fontFamily: 'var(--nous-font-family-mono)',
    color: 'var(--nous-fg-muted)',
    letterSpacing: '0.05em',
    padding: 'var(--nous-space-xs) 0',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--nous-space-sm)',
    padding: 'var(--nous-space-sm) var(--nous-space-md)',
    border: 'none',
    borderRadius: 'var(--nous-radius-sm)',
    background: 'transparent',
    color: 'var(--nous-fg)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'var(--nous-hover-button-transition)',
  },
  listItemLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: 'var(--nous-font-size-sm)',
  },
  timestamp: {
    fontSize: 'var(--nous-font-size-xs)',
    color: 'var(--nous-fg-muted)',
    flexShrink: 0,
  },
  emptyState: {
    fontSize: 'var(--nous-font-size-sm)',
    color: 'var(--nous-fg-subtle)',
    padding: 'var(--nous-space-md) var(--nous-space-sm)',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--nous-space-xs)',
    border: '1px solid var(--nous-shell-column-border)',
    borderRadius: 'var(--nous-radius-md)',
    background: 'var(--nous-catalog-card-bg)',
    color: 'var(--nous-text-secondary)',
    padding: 'var(--nous-space-xs) var(--nous-space-sm)',
    cursor: 'pointer',
    fontSize: 'var(--nous-font-size-sm)',
    transition: 'var(--nous-hover-button-transition)',
    alignSelf: 'flex-start',
    margin: 'var(--nous-space-sm)',
  },
  newChatButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--nous-space-xs)',
    border: '1px solid var(--nous-shell-column-border)',
    borderRadius: 'var(--nous-radius-md)',
    background: 'var(--nous-catalog-card-bg)',
    color: 'var(--nous-fg)',
    padding: 'var(--nous-space-sm) var(--nous-space-md)',
    cursor: 'pointer',
    fontSize: 'var(--nous-font-size-sm)',
    transition: 'var(--nous-hover-button-transition)',
    alignSelf: 'flex-start',
  },
} as const
