import { z } from 'zod';
import type {
  IDocumentStore,
  PublicMcpSubject,
  PublicMcpTaskProjection,
  PublicMcpTaskResult,
} from '@nous/shared';
import {
  PublicMcpTaskProjectionSchema,
  PublicMcpTaskResultSchema,
} from '@nous/shared';

export const PUBLIC_MCP_TASK_PROJECTION_COLLECTION = 'public_mcp_task_projection';

const PublicMcpTaskProjectionRecordSchema = PublicMcpTaskProjectionSchema.extend({
  subjectClientId: z.string().min(1),
  result: PublicMcpTaskResultSchema.optional(),
}).strict();
type PublicMcpTaskProjectionRecord = z.infer<typeof PublicMcpTaskProjectionRecordSchema>;

export interface CreatePublicTaskInput {
  taskId: string;
  toolName: string;
  subject: Pick<PublicMcpSubject, 'namespace' | 'clientId'>;
  canonicalRunId: string;
  status: PublicMcpTaskProjection['status'];
  submittedAt: string;
}

export class PublicMcpTaskProjectionStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async create(input: CreatePublicTaskInput): Promise<PublicMcpTaskProjection> {
    const record = PublicMcpTaskProjectionRecordSchema.parse({
      taskId: input.taskId,
      toolName: input.toolName,
      subjectNamespace: input.subject.namespace,
      subjectClientId: input.subject.clientId,
      canonicalRunId: input.canonicalRunId,
      status: input.status,
      submittedAt: input.submittedAt,
      updatedAt: input.submittedAt,
    });
    await this.documentStore.put(
      PUBLIC_MCP_TASK_PROJECTION_COLLECTION,
      record.taskId,
      record,
    );
    return toProjection(record);
  }

  async markRunning(taskId: string, updatedAt: string): Promise<PublicMcpTaskProjection | null> {
    return this.update(taskId, {
      status: 'running',
      updatedAt,
      waitReason: undefined,
      errorCode: undefined,
    });
  }

  async markWaiting(
    taskId: string,
    waitReason: PublicMcpTaskProjection['waitReason'],
    updatedAt: string,
  ): Promise<PublicMcpTaskProjection | null> {
    return this.update(taskId, {
      status: 'waiting',
      waitReason,
      updatedAt,
    });
  }

  async complete(
    taskId: string,
    result: PublicMcpTaskResult,
    updatedAt: string,
  ): Promise<PublicMcpTaskProjection | null> {
    return this.update(taskId, {
      status: result.status,
      updatedAt,
      completedAt: updatedAt,
      errorCode: result.error?.message,
      result,
    });
  }

  async getTask(
    subject: Pick<PublicMcpSubject, 'namespace' | 'clientId'>,
    taskId: string,
  ): Promise<PublicMcpTaskProjection | null> {
    const record = await this.getOwnedRecord(subject, taskId);
    return record ? toProjection(record) : null;
  }

  async getTaskResult(
    subject: Pick<PublicMcpSubject, 'namespace' | 'clientId'>,
    taskId: string,
  ): Promise<PublicMcpTaskResult | null> {
    const record = await this.getOwnedRecord(subject, taskId);
    return record?.result ? PublicMcpTaskResultSchema.parse(record.result) : null;
  }

  private async getOwnedRecord(
    subject: Pick<PublicMcpSubject, 'namespace' | 'clientId'>,
    taskId: string,
  ): Promise<PublicMcpTaskProjectionRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_TASK_PROJECTION_COLLECTION,
      taskId,
    );
    if (!raw) {
      return null;
    }
    const record = PublicMcpTaskProjectionRecordSchema.parse(raw);
    if (
      record.subjectNamespace !== subject.namespace ||
      record.subjectClientId !== subject.clientId
    ) {
      return null;
    }
    return record;
  }

  private async update(
    taskId: string,
    patch: Partial<PublicMcpTaskProjectionRecord>,
  ): Promise<PublicMcpTaskProjection | null> {
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_TASK_PROJECTION_COLLECTION,
      taskId,
    );
    if (!raw) {
      return null;
    }
    const next = PublicMcpTaskProjectionRecordSchema.parse({
      ...PublicMcpTaskProjectionRecordSchema.parse(raw),
      ...patch,
    });
    await this.documentStore.put(PUBLIC_MCP_TASK_PROJECTION_COLLECTION, taskId, next);
    return toProjection(next);
  }
}

function toProjection(record: PublicMcpTaskProjectionRecord): PublicMcpTaskProjection {
  return PublicMcpTaskProjectionSchema.parse({
    taskId: record.taskId,
    toolName: record.toolName,
    subjectNamespace: record.subjectNamespace,
    canonicalRunId: record.canonicalRunId,
    status: record.status,
    waitReason: record.waitReason,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    errorCode: record.errorCode,
  });
}
