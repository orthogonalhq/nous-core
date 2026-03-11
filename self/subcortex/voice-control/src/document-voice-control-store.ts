import type {
  IDocumentStore,
  ProjectId,
  VoiceAssistantOutputStateRecord,
  VoiceBargeInRecord,
  VoiceContinuationRecord,
  VoiceDegradedModeState,
  VoiceSessionProjection,
  VoiceTurnDecisionRecord,
  VoiceTurnStateRecord,
} from '@nous/shared';
import {
  VoiceAssistantOutputStateRecordSchema,
  VoiceBargeInRecordSchema,
  VoiceContinuationRecordSchema,
  VoiceDegradedModeStateSchema,
  VoiceSessionProjectionSchema,
  VoiceTurnDecisionRecordSchema,
  VoiceTurnStateRecordSchema,
} from '@nous/shared';

export const VOICE_TURN_COLLECTION = 'voice_turns';
export const VOICE_DECISION_COLLECTION = 'voice_decisions';
export const VOICE_ASSISTANT_OUTPUT_COLLECTION = 'voice_assistant_outputs';
export const VOICE_BARGE_IN_COLLECTION = 'voice_barge_ins';
export const VOICE_CONTINUATION_COLLECTION = 'voice_continuations';
export const VOICE_DEGRADED_MODE_COLLECTION = 'voice_degraded_modes';
export const VOICE_SESSION_PROJECTION_COLLECTION = 'voice_session_projections';

function parseRecord<T>(
  schema: {
    safeParse: (value: unknown) => { success: true; data: T } | { success: false };
  },
  value: unknown,
): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentVoiceControlStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async saveTurn(record: VoiceTurnStateRecord): Promise<VoiceTurnStateRecord> {
    const validated = VoiceTurnStateRecordSchema.parse(record);
    await this.documentStore.put(VOICE_TURN_COLLECTION, validated.turn_id, validated);
    return validated;
  }

  async getTurn(turnId: string): Promise<VoiceTurnStateRecord | null> {
    const raw = await this.documentStore.get<unknown>(VOICE_TURN_COLLECTION, turnId);
    return parseRecord(VoiceTurnStateRecordSchema, raw);
  }

  async listTurnsBySession(sessionId: string): Promise<VoiceTurnStateRecord[]> {
    const rows = await this.documentStore.query<unknown>(VOICE_TURN_COLLECTION, {
      where: { session_id: sessionId },
      orderBy: 'updated_at',
      orderDirection: 'desc',
    });
    return rows
      .map((row) => parseRecord(VoiceTurnStateRecordSchema, row))
      .filter((row): row is VoiceTurnStateRecord => row !== null);
  }

  async listTurnsByProject(projectId: ProjectId): Promise<VoiceTurnStateRecord[]> {
    const rows = await this.documentStore.query<unknown>(VOICE_TURN_COLLECTION, {
      where: { project_id: projectId },
      orderBy: 'updated_at',
      orderDirection: 'desc',
    });
    return rows
      .map((row) => parseRecord(VoiceTurnStateRecordSchema, row))
      .filter((row): row is VoiceTurnStateRecord => row !== null);
  }

  async saveDecision(record: VoiceTurnDecisionRecord): Promise<VoiceTurnDecisionRecord> {
    const validated = VoiceTurnDecisionRecordSchema.parse(record);
    await this.documentStore.put(VOICE_DECISION_COLLECTION, validated.decision_id, validated);
    return validated;
  }

  async listDecisionsBySession(sessionId: string): Promise<VoiceTurnDecisionRecord[]> {
    const rows = await this.documentStore.query<unknown>(VOICE_DECISION_COLLECTION, {
      where: { session_id: sessionId },
      orderBy: 'decided_at',
      orderDirection: 'desc',
    });
    return rows
      .map((row) => parseRecord(VoiceTurnDecisionRecordSchema, row))
      .filter((row): row is VoiceTurnDecisionRecord => row !== null);
  }

  async listDecisionsByProject(projectId: ProjectId): Promise<VoiceTurnDecisionRecord[]> {
    const rows = await this.documentStore.query<unknown>(VOICE_DECISION_COLLECTION, {
      where: { project_id: projectId },
      orderBy: 'decided_at',
      orderDirection: 'desc',
    });
    return rows
      .map((row) => parseRecord(VoiceTurnDecisionRecordSchema, row))
      .filter((row): row is VoiceTurnDecisionRecord => row !== null);
  }

  async saveAssistantOutput(
    record: VoiceAssistantOutputStateRecord,
  ): Promise<VoiceAssistantOutputStateRecord> {
    const validated = VoiceAssistantOutputStateRecordSchema.parse(record);
    await this.documentStore.put(
      VOICE_ASSISTANT_OUTPUT_COLLECTION,
      validated.output_id,
      validated,
    );
    return validated;
  }

  async getAssistantOutput(
    outputId: string,
  ): Promise<VoiceAssistantOutputStateRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      VOICE_ASSISTANT_OUTPUT_COLLECTION,
      outputId,
    );
    return parseRecord(VoiceAssistantOutputStateRecordSchema, raw);
  }

  async listAssistantOutputsBySession(
    sessionId: string,
  ): Promise<VoiceAssistantOutputStateRecord[]> {
    const rows = await this.documentStore.query<unknown>(
      VOICE_ASSISTANT_OUTPUT_COLLECTION,
      {
        where: { session_id: sessionId },
        orderBy: 'updated_at',
        orderDirection: 'desc',
      },
    );
    return rows
      .map((row) => parseRecord(VoiceAssistantOutputStateRecordSchema, row))
      .filter((row): row is VoiceAssistantOutputStateRecord => row !== null);
  }

  async listAssistantOutputsByProject(
    projectId: ProjectId,
  ): Promise<VoiceAssistantOutputStateRecord[]> {
    const rows = await this.documentStore.query<unknown>(
      VOICE_ASSISTANT_OUTPUT_COLLECTION,
      {
        where: { project_id: projectId },
        orderBy: 'updated_at',
        orderDirection: 'desc',
      },
    );
    return rows
      .map((row) => parseRecord(VoiceAssistantOutputStateRecordSchema, row))
      .filter((row): row is VoiceAssistantOutputStateRecord => row !== null);
  }

  async saveBargeIn(record: VoiceBargeInRecord): Promise<VoiceBargeInRecord> {
    const validated = VoiceBargeInRecordSchema.parse(record);
    await this.documentStore.put(VOICE_BARGE_IN_COLLECTION, validated.barge_in_id, validated);
    return validated;
  }

  async listBargeInsBySession(sessionId: string): Promise<VoiceBargeInRecord[]> {
    const rows = await this.documentStore.query<unknown>(VOICE_BARGE_IN_COLLECTION, {
      where: { session_id: sessionId },
      orderBy: 'detected_at',
      orderDirection: 'desc',
    });
    return rows
      .map((row) => parseRecord(VoiceBargeInRecordSchema, row))
      .filter((row): row is VoiceBargeInRecord => row !== null);
  }

  async saveContinuation(
    record: VoiceContinuationRecord,
  ): Promise<VoiceContinuationRecord> {
    const validated = VoiceContinuationRecordSchema.parse(record);
    await this.documentStore.put(
      VOICE_CONTINUATION_COLLECTION,
      validated.continuation_id,
      validated,
    );
    return validated;
  }

  async listContinuationsBySession(
    sessionId: string,
  ): Promise<VoiceContinuationRecord[]> {
    const rows = await this.documentStore.query<unknown>(VOICE_CONTINUATION_COLLECTION, {
      where: { session_id: sessionId },
      orderBy: 'resolved_at',
      orderDirection: 'desc',
    });
    return rows
      .map((row) => parseRecord(VoiceContinuationRecordSchema, row))
      .filter((row): row is VoiceContinuationRecord => row !== null);
  }

  async saveDegradedMode(
    record: VoiceDegradedModeState,
  ): Promise<VoiceDegradedModeState> {
    const validated = VoiceDegradedModeStateSchema.parse(record);
    await this.documentStore.put(
      VOICE_DEGRADED_MODE_COLLECTION,
      validated.session_id,
      validated,
    );
    return validated;
  }

  async getDegradedMode(sessionId: string): Promise<VoiceDegradedModeState | null> {
    const raw = await this.documentStore.get<unknown>(
      VOICE_DEGRADED_MODE_COLLECTION,
      sessionId,
    );
    return parseRecord(VoiceDegradedModeStateSchema, raw);
  }

  async listDegradedModesByProject(
    projectId: ProjectId,
  ): Promise<VoiceDegradedModeState[]> {
    const rows = await this.documentStore.query<unknown>(
      VOICE_DEGRADED_MODE_COLLECTION,
      {
        where: { project_id: projectId },
        orderBy: 'entered_at',
        orderDirection: 'desc',
      },
    );
    return rows
      .map((row) => parseRecord(VoiceDegradedModeStateSchema, row))
      .filter((row): row is VoiceDegradedModeState => row !== null);
  }

  async saveSessionProjection(
    record: VoiceSessionProjection,
  ): Promise<VoiceSessionProjection> {
    const validated = VoiceSessionProjectionSchema.parse(record);
    await this.documentStore.put(
      VOICE_SESSION_PROJECTION_COLLECTION,
      validated.session_id,
      validated,
    );
    return validated;
  }

  async getSessionProjection(
    sessionId: string,
  ): Promise<VoiceSessionProjection | null> {
    const raw = await this.documentStore.get<unknown>(
      VOICE_SESSION_PROJECTION_COLLECTION,
      sessionId,
    );
    return parseRecord(VoiceSessionProjectionSchema, raw);
  }

  async listSessionProjectionsByProject(
    projectId: ProjectId,
  ): Promise<VoiceSessionProjection[]> {
    const rows = await this.documentStore.query<unknown>(
      VOICE_SESSION_PROJECTION_COLLECTION,
      {
        where: { project_id: projectId },
        orderBy: 'updated_at',
        orderDirection: 'desc',
      },
    );
    return rows
      .map((row) => parseRecord(VoiceSessionProjectionSchema, row))
      .filter((row): row is VoiceSessionProjection => row !== null);
  }
}
