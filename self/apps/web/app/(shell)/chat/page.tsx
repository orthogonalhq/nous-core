'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useProject } from '@/lib/project-context';
import { EscalationInbox } from '@/components/chat/escalation-inbox';
import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';
import { buildMaoReturnHref, readMaoNavigationContext } from '@/lib/mao-links';

export default function ChatPage() {
  return (
    <React.Suspense
      fallback={(
        <div
          style={{
            display: 'flex',
            height: '100%',
            flexDirection: 'column',
          }}
        />
      )}
    >
      <ChatPageContent />
    </React.Suspense>
  );
}

function ChatPageContent() {
  const { projectId, setProjectId } = useProject();
  const searchParams = useSearchParams();
  const linkedProjectId = searchParams.get('projectId');
  const maoContext = readMaoNavigationContext(searchParams);
  const [optimisticMessages, setOptimisticMessages] = React.useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);

  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
    }
  }, [linkedProjectId, projectId, setProjectId]);

  const { data: history } = trpc.chat.getHistory.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );
  const { data: escalationQueue } = trpc.escalations.listProjectQueue.useQuery(
    { projectId: projectId ?? undefined as any },
    { enabled: !!projectId },
  );

  const utils = trpc.useUtils();
  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: async () => {
      if (projectId) {
        await utils.chat.getHistory.invalidate({ projectId });
      }
      setOptimisticMessages([]);
    },
  });

  const handleSend = (message: string) => {
    setOptimisticMessages((prev) => [...prev, { role: 'user', content: message }]);
    sendMessage.mutate({
      message,
      projectId: projectId ?? undefined,
    });
  };

  const baseEntries = history?.entries ?? [];
  const mergedEntries = [
    ...baseEntries.map((e) => ({
      role: e.role as 'user' | 'assistant' | 'system' | 'tool',
      content: e.content,
      timestamp: e.timestamp,
      metadata: e.metadata,
    })),
    ...optimisticMessages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
      timestamp: new Date().toISOString(),
      metadata: undefined as Record<string, unknown> | undefined,
    })),
  ];

  const displayContext = {
    entries: mergedEntries,
    summary: history?.summary,
    tokenCount: history?.tokenCount ?? 0,
  };

  if (!projectId) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-3xl)',
        }}
      >
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          Select or create a project from the sidebar to start chatting.
        </p>
      </div>
    );
  }

  const linkedRunId = searchParams.get('runId');
  const linkedNodeId = searchParams.get('nodeId');

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {escalationQueue ? (
        <EscalationInbox queue={escalationQueue} maoContext={maoContext} />
      ) : null}
      {maoContext ? (
        <div
          style={{
            borderBottom: '1px solid var(--nous-shell-column-border)',
            background: 'var(--nous-bg-hover)',
            padding: '12px var(--nous-space-2xl)',
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          MAO reasoning handoff active
          {maoContext.reasoningRef ? ` with reasoning ${maoContext.reasoningRef}` : ''}
          {maoContext.evidenceRef ? ` and evidence ${maoContext.evidenceRef}` : ''}.
          <Link
            href={buildMaoReturnHref(maoContext)}
            style={{
              marginLeft: 'var(--nous-space-xs)',
              textDecoration: 'underline',
              textUnderlineOffset: '4px',
            }}
          >
            Return to MAO
          </Link>
        </div>
      ) : null}
      {linkedRunId || linkedNodeId ? (
        <div
          style={{
            borderBottom: '1px solid var(--nous-shell-column-border)',
            background: 'var(--nous-bg-hover)',
            padding: '12px var(--nous-space-2xl)',
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Linked workflow context
          {linkedRunId ? ` run ${linkedRunId.slice(0, 8)}` : ''}
          {linkedNodeId ? ` node ${linkedNodeId.slice(0, 8)}` : ''}.
        </div>
      ) : null}
      <MessageList context={displayContext} />
      <ChatInput
        onSend={handleSend}
        disabled={sendMessage.isPending}
      />
    </div>
  );
}
