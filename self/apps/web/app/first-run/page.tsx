'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { WelcomeStep } from './components/welcome-step';
import { ConfigReviewStep } from './components/config-review-step';
import { FirstMessageStep } from './components/first-message-step';
import { ConfirmStep } from './components/confirm-step';

type Step = 'welcome' | 'config_review' | 'first_message' | 'confirm';

export default function FirstRunPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [projectId, setProjectId] = useState<string | null>(null);

  const { data: status } = trpc.firstRun.status.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const createProject = trpc.projects.create.useMutation({
    onSuccess: (p) => setProjectId(p.id),
  });

  useEffect(() => {
    if (status?.complete) {
      router.replace('/chat');
    }
  }, [status, router]);

  useEffect(() => {
    if (step === 'first_message' && !projectId && projects) {
      if (projects.length > 0) {
        setProjectId(projects[0]!.id);
      } else {
        createProject.mutate({ name: 'Default' });
      }
    }
  }, [step, projectId, projects]);

  if (status?.complete) {
    return null;
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '42rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-3xl)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'var(--nous-font-size-xl)',
            fontWeight: 'var(--nous-font-weight-semibold)',
          }}
        >
          Nous Setup
        </h1>
        <p
          style={{
            marginTop: '4px',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Step {['welcome', 'config_review', 'first_message', 'confirm'].indexOf(step) + 1} of 4
        </p>
      </div>

      {step === 'welcome' && (
        <WelcomeStep onNext={() => setStep('config_review')} />
      )}
      {step === 'config_review' && (
        <ConfigReviewStep onNext={() => setStep('first_message')} />
      )}
      {step === 'first_message' && (
        <FirstMessageStep
          projectId={projectId}
          onNext={() => setStep('confirm')}
        />
      )}
      {step === 'confirm' && <ConfirmStep />}
    </div>
  );
}
