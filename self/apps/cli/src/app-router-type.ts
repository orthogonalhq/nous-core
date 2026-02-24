/**
 * AppRouter type for CLI tRPC client.
 * Mirrors the procedures from @nous/web server.
 * TODO: Import from shared package when router is extracted.
 */
import type {
  ConfirmationProof,
  ConfirmationProofRequest,
  ControlCommandEnvelope,
  OpctlSubmitResult,
  ProjectId,
  TraceId,
  VerificationReport,
  VerificationReportId,
  WitnessCheckpoint,
} from '@nous/shared';

export type AppRouter = {
  chat: {
    sendMessage: {
      mutate: (input: {
        message: string;
        projectId?: ProjectId;
      }) => Promise<{ response: string; traceId: TraceId }>;
    };
  };
  projects: {
    list: { query: () => Promise<Array<{ id: ProjectId; name: string; type: string }>> };
    create: { mutate: (input: { name: string; type?: string }) => Promise<{ id: ProjectId; name: string }> };
    get: { query: (input: { id: ProjectId }) => Promise<{ id: ProjectId; name: string } | null> };
  };
  config: {
    get: { query: () => Promise<{ pfcTier: number; modelRoleAssignments?: Array<{ role: string; providerId: string }> }> };
    update: { mutate: (input: { pfcTier?: number }) => Promise<void> };
  };
  witness: {
    verify: {
      mutate: (input?: {
        fromSequence?: number;
        toSequence?: number;
      }) => Promise<VerificationReport>;
    };
    listReports: {
      query: (input?: { limit?: number }) => Promise<VerificationReport[]>;
    };
    getReport: {
      query: (input: { id: VerificationReportId }) => Promise<VerificationReport | null>;
    };
    latestCheckpoint: {
      query: () => Promise<WitnessCheckpoint | null>;
    };
  };
  opctl: {
    submitCommand: {
      mutate: (input: {
        envelope: ControlCommandEnvelope;
        confirmationProof?: ConfirmationProof;
      }) => Promise<OpctlSubmitResult>;
    };
    requestConfirmationProof: {
      mutate: (input: ConfirmationProofRequest) => Promise<ConfirmationProof>;
    };
    hasStartLock: {
      query: (input: { projectId: string }) => Promise<boolean>;
    };
  };
};
