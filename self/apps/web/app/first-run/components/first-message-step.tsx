'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';
import { trpc } from '@/lib/trpc';

interface FirstMessageStepProps {
  projectId: string | null;
  onNext: () => void;
}

export function FirstMessageStep({ projectId, onNext }: FirstMessageStepProps) {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string | null>(null);

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      setResponse(data.response);
    },
  });

  const handleSend = () => {
    if (!message.trim() || !projectId) return;
    sendMessage.mutate({ message: message.trim(), projectId });
  };

  return (
    <Card style={{ width: '100%', maxWidth: '32rem' }}>
      <CardHeader>
        <CardTitle>Say something to Nous</CardTitle>
      </CardHeader>
      <CardContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nous-space-md)',
        }}
      >
        <p
          style={{
            color: 'var(--nous-text-secondary)',
            fontSize: 'var(--nous-font-size-sm)',
          }}
        >
          Send a message to verify everything works.
        </p>
        {!projectId ? (
          <p
            style={{
              color: 'var(--nous-text-secondary)',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            Creating project...
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                gap: 'var(--nous-space-xs)',
              }}
            >
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                disabled={sendMessage.isPending}
                style={{
                  flex: '1 1 0%',
                  borderRadius: 'var(--nous-radius-md)',
                  border: '1px solid var(--nous-shell-column-border)',
                  background: 'var(--nous-bg-surface)',
                  padding: 'var(--nous-space-sm) var(--nous-space-md)',
                  fontSize: 'var(--nous-font-size-sm)',
                  color: 'var(--nous-text-primary)',
                }}
              />
              <Button
                type="button"
                onClick={handleSend}
                disabled={sendMessage.isPending || !message.trim()}
              >
                Send
              </Button>
            </div>
            {response && (
              <div
                style={{
                  borderRadius: 'var(--nous-radius-md)',
                  border: '1px solid var(--nous-shell-column-border)',
                  background: 'var(--nous-bg-hover)',
                  padding: 'var(--nous-space-sm)',
                  fontSize: 'var(--nous-font-size-sm)',
                }}
              >
                <p style={{ fontWeight: 'var(--nous-font-weight-medium)' }}>Nous:</p>
                <p
                  style={{
                    marginTop: '4px',
                    color: 'var(--nous-text-secondary)',
                  }}
                >
                  {response}
                </p>
              </div>
            )}
            {response && (
              <Button type="button" onClick={onNext}>Continue</Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
