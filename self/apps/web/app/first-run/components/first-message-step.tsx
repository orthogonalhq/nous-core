'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Say something to Nous</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Send a message to verify everything works.
        </p>
        {!projectId ? (
          <p className="text-muted-foreground text-sm">
            Creating project...
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                disabled={sendMessage.isPending}
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
              <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
                <p className="font-medium">Nous:</p>
                <p className="text-muted-foreground mt-1">{response}</p>
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
