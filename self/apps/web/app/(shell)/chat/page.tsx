'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useProject } from '@/lib/project-context';
import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';

export default function ChatPage() {
  const { projectId } = useProject();
  const [optimisticMessages, setOptimisticMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);

  const { data: history } = trpc.chat.getHistory.useQuery(
    { projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const utils = trpc.useUtils();
  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      setOptimisticMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ]);
      if (projectId) {
        utils.chat.getHistory.invalidate({ projectId });
      }
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
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select or create a project from the sidebar to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MessageList context={displayContext} />
      <ChatInput
        onSend={handleSend}
        disabled={sendMessage.isPending}
      />
    </div>
  );
}
