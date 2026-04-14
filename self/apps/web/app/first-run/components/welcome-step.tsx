'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <Card style={{ width: '100%', maxWidth: '32rem' }}>
      <CardHeader>
        <CardTitle>Welcome to Nous</CardTitle>
      </CardHeader>
      <CardContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nous-space-md)',
        }}
      >
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          <strong>What is Nous?</strong> Nous (Neural Operations Unification
          System) is an open-core AI agent operating system modeled on the
          structure of the human mind. It runs projects, manages memory, and
          learns from your interactions.
        </p>
        <p style={{ color: 'var(--nous-text-secondary)' }}>
          <strong>What just happened?</strong> The installer set up Ollama (your
          local LLM), pulled a default model, created your configuration, and
          started the Nous backend. You&apos;re ready to go.
        </p>
        <Button type="button" onClick={onNext}>Continue</Button>
      </CardContent>
    </Card>
  );
}
