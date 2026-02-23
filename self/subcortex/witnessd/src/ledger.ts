/**
 * Append-only witness ledger storage primitives.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  IDocumentStore,
  WitnessActor,
  WitnessEvent,
  WitnessEventStatus,
  WitnessEventStage,
  WitnessCheckpoint,
  WitnessCheckpointReason,
  CriticalActionCategory,
  ProjectId,
  TraceId,
  WitnessEventId,
} from '@nous/shared';
import { WitnessCheckpointSchema, WitnessEventSchema } from '@nous/shared';
import { hashCanonical } from './serialization.js';

export const WITNESS_EVENTS_COLLECTION = 'witness_events';
export const WITNESS_CHECKPOINTS_COLLECTION = 'witness_checkpoints';
export const WITNESS_LEDGER_HEAD_COLLECTION = 'witness_ledger_head';
export const WITNESS_REPORTS_COLLECTION = 'witness_reports';

const LEDGER_HEAD_ID = 'head';

const LedgerHeadSchema = z.object({
  id: z.literal(LEDGER_HEAD_ID),
  lastSequence: z.number().int().nonnegative(),
  lastEventHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  lastCheckpointSequence: z.number().int().nonnegative(),
  lastCheckpointHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  activeKeyEpoch: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type LedgerHead = z.infer<typeof LedgerHeadSchema>;

export interface AppendLedgerEventInput {
  eventId?: WitnessEventId;
  stage: WitnessEventStage;
  actionCategory: CriticalActionCategory;
  actionRef: string;
  authorizationRef?: WitnessEventId;
  traceId?: TraceId;
  projectId?: ProjectId;
  actor: WitnessActor;
  status: WitnessEventStatus;
  invariantCode?: string;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export function buildEventPayload(input: AppendLedgerEventInput): Record<string, unknown> {
  return {
    stage: input.stage,
    actionCategory: input.actionCategory,
    actionRef: input.actionRef,
    authorizationRef: input.authorizationRef,
    traceId: input.traceId,
    projectId: input.projectId,
    actor: input.actor,
    status: input.status,
    invariantCode: input.invariantCode,
    detail: input.detail,
    occurredAt: input.occurredAt,
  };
}

export async function getLedgerHead(
  documentStore: IDocumentStore,
  now: string,
): Promise<LedgerHead> {
  const raw = await documentStore.get<unknown>(
    WITNESS_LEDGER_HEAD_COLLECTION,
    LEDGER_HEAD_ID,
  );
  if (!raw) {
    const head = LedgerHeadSchema.parse({
      id: LEDGER_HEAD_ID,
      lastSequence: 0,
      lastEventHash: null,
      lastCheckpointSequence: 0,
      lastCheckpointHash: null,
      activeKeyEpoch: 1,
      updatedAt: now,
    });
    await documentStore.put(WITNESS_LEDGER_HEAD_COLLECTION, LEDGER_HEAD_ID, head);
    return head;
  }

  const parsed = LedgerHeadSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  const fallback = LedgerHeadSchema.parse({
    id: LEDGER_HEAD_ID,
    lastSequence: 0,
    lastEventHash: null,
    lastCheckpointSequence: 0,
    lastCheckpointHash: null,
    activeKeyEpoch: 1,
    updatedAt: now,
  });
  await documentStore.put(WITNESS_LEDGER_HEAD_COLLECTION, LEDGER_HEAD_ID, fallback);
  return fallback;
}

export async function saveLedgerHead(
  documentStore: IDocumentStore,
  head: LedgerHead,
): Promise<void> {
  await documentStore.put(WITNESS_LEDGER_HEAD_COLLECTION, LEDGER_HEAD_ID, head);
}

export async function appendLedgerEvent(
  documentStore: IDocumentStore,
  head: LedgerHead,
  input: AppendLedgerEventInput,
  recordedAt: string,
): Promise<{ event: WitnessEvent; nextHead: LedgerHead }> {
  const sequence = head.lastSequence + 1;
  const payload = buildEventPayload(input);
  const payloadHash = hashCanonical(payload);
  const eventHash = hashCanonical({
    sequence,
    previousEventHash: head.lastEventHash,
    payloadHash,
  });

  const event = WitnessEventSchema.parse({
    id: input.eventId ?? (randomUUID() as WitnessEventId),
    sequence,
    previousEventHash: head.lastEventHash,
    payloadHash,
    eventHash,
    stage: input.stage,
    actionCategory: input.actionCategory,
    actionRef: input.actionRef,
    authorizationRef: input.authorizationRef,
    traceId: input.traceId,
    projectId: input.projectId,
    actor: input.actor,
    status: input.status,
    invariantCode: input.invariantCode,
    detail: input.detail,
    occurredAt: input.occurredAt,
    recordedAt,
  });

  await documentStore.put(WITNESS_EVENTS_COLLECTION, event.id, event);

  const nextHead = LedgerHeadSchema.parse({
    ...head,
    lastSequence: event.sequence,
    lastEventHash: event.eventHash,
    updatedAt: recordedAt,
  });
  await saveLedgerHead(documentStore, nextHead);

  return { event, nextHead };
}

export async function getEventById(
  documentStore: IDocumentStore,
  id: WitnessEventId,
): Promise<WitnessEvent | null> {
  const raw = await documentStore.get<unknown>(WITNESS_EVENTS_COLLECTION, id);
  if (!raw) {
    return null;
  }
  const parsed = WitnessEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function listEvents(
  documentStore: IDocumentStore,
): Promise<WitnessEvent[]> {
  const raw = await documentStore.query<unknown>(WITNESS_EVENTS_COLLECTION, {
    orderBy: 'sequence',
    orderDirection: 'asc',
  });

  const events: WitnessEvent[] = [];
  for (const item of raw) {
    const parsed = WitnessEventSchema.safeParse(item);
    if (parsed.success) {
      events.push(parsed.data);
    }
  }
  return events;
}

export async function saveCheckpoint(
  documentStore: IDocumentStore,
  checkpoint: WitnessCheckpoint,
  nextHead: LedgerHead,
): Promise<void> {
  await documentStore.put(
    WITNESS_CHECKPOINTS_COLLECTION,
    checkpoint.id,
    WitnessCheckpointSchema.parse(checkpoint),
  );
  await saveLedgerHead(documentStore, nextHead);
}

export async function listCheckpoints(
  documentStore: IDocumentStore,
): Promise<WitnessCheckpoint[]> {
  const raw = await documentStore.query<unknown>(WITNESS_CHECKPOINTS_COLLECTION, {
    orderBy: 'checkpointSequence',
    orderDirection: 'asc',
  });

  const checkpoints: WitnessCheckpoint[] = [];
  for (const item of raw) {
    const parsed = WitnessCheckpointSchema.safeParse(item);
    if (parsed.success) {
      checkpoints.push(parsed.data);
    }
  }
  return checkpoints;
}

export async function getLatestCheckpoint(
  documentStore: IDocumentStore,
): Promise<WitnessCheckpoint | null> {
  const raw = await documentStore.query<unknown>(WITNESS_CHECKPOINTS_COLLECTION, {
    orderBy: 'checkpointSequence',
    orderDirection: 'desc',
    limit: 1,
  });

  if (raw.length === 0) {
    return null;
  }
  const parsed = WitnessCheckpointSchema.safeParse(raw[0]);
  return parsed.success ? parsed.data : null;
}

export function buildCheckpointHash(input: {
  checkpointSequence: number;
  startEventSequence: number;
  endEventSequence: number;
  previousCheckpointHash: string | null;
  ledgerHeadHash: string;
  keyEpoch: number;
  reason: WitnessCheckpointReason;
}): string {
  return hashCanonical(input);
}
