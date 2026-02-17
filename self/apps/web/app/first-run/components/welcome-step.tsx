'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Welcome to Nous</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          <strong>What is Nous?</strong> Nous (Neural Operations Unification
          System) is an open-core AI agent operating system modeled on the
          structure of the human mind. It runs projects, manages memory, and
          learns from your interactions.
        </p>
        <p className="text-muted-foreground">
          <strong>What just happened?</strong> The installer set up Ollama (your
          local LLM), pulled a default model, created your configuration, and
          started the Nous backend. You&apos;re ready to go.
        </p>
        <Button onClick={onNext}>Continue</Button>
      </CardContent>
    </Card>
  );
}
