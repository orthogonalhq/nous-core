'use client';

import * as React from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';

interface WorkflowEmptyStateProps {
  projectType: 'protocol' | 'intent' | 'hybrid';
  reasonCode?: string;
  onStartAuthoring?: () => void;
}

export function WorkflowEmptyState({
  projectType,
  reasonCode,
  onStartAuthoring,
}: WorkflowEmptyStateProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Inspect-first workflow surface</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 text-sm text-muted-foreground">
        <p>
          {projectType === 'intent'
            ? 'This intent project has no canonical workflow definition yet. Monitoring stays inspect-first until a definition is authored and saved.'
            : 'No canonical workflow definition is currently available for this project.'}
        </p>
        {reasonCode ? <p>Diagnostic: {reasonCode}</p> : null}
        {onStartAuthoring ? (
          <Button onClick={onStartAuthoring}>Create starter workflow</Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
