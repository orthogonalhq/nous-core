'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChatPanel } from '@nous/ui/panels';
import type { ChatAPI } from '@nous/ui/panels';
import { trpc } from '@/lib/trpc';
import { useProject } from '@/lib/project-context';
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

  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
    }
  }, [linkedProjectId, projectId, setProjectId]);

  const utils = trpc.useUtils();
  const sendMessage = trpc.chat.sendMessage.useMutation();

  const chatApi: ChatAPI = React.useMemo(
    () => ({
      send: async (message: string) => {
        const result = await sendMessage.mutateAsync({
          message,
          projectId: projectId ?? undefined,
        });
        if (projectId) {
          await utils.chat.getHistory.invalidate({ projectId });
        }
        return { response: result.response, traceId: result.traceId };
      },
      getHistory: async () => {
        const data = await utils.chat.getHistory.fetch({
          projectId: projectId ?? undefined,
        });
        return (data?.entries ?? [])
          .filter(
            (e) => e.role === 'user' || e.role === 'assistant',
          )
          .map((e) => ({
            role: e.role as 'user' | 'assistant',
            content: e.content,
            timestamp: e.timestamp,
          }));
      },
    }),
    [projectId, sendMessage, utils],
  );

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
          Select or create a project from the navigation panel to start chatting.
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
      <ChatPanel chatApi={chatApi} className="flex-1" />
    </div>
  );
}
