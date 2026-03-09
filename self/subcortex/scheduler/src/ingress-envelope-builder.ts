import { createHash, randomUUID } from 'node:crypto';
import type {
  IngressDeliveryMode,
  IngressTriggerEnvelope,
  ProjectId,
  ScheduleDefinition,
  WorkmodeId,
} from '@nous/shared';

export interface BuildScheduledEnvelopeInput {
  schedule: ScheduleDefinition;
  occurredAt: string;
  receivedAt?: string;
  payload?: unknown;
  triggerId?: string;
  nonce?: string;
  traceParent?: string | null;
}

export interface BuildEventEnvelopeInput {
  projectId: ProjectId;
  workflowRef: string;
  workmodeId: WorkmodeId;
  triggerType: 'hook' | 'system_event';
  sourceId: string;
  eventName: string;
  idempotencyKey: string;
  payload?: unknown;
  requestedDeliveryMode?: IngressDeliveryMode;
  occurredAt?: string;
  receivedAt?: string;
  triggerId?: string;
  nonce?: string;
  authContextRef?: string | null;
  traceParent?: string | null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

function buildPayloadRef(payload: unknown): string {
  const serialized = stableStringify(payload);
  const digest = createHash('sha256').update(serialized).digest('hex');
  return `sha256:${digest}`;
}

export class IngressEnvelopeBuilder {
  constructor(private readonly now: () => Date = () => new Date()) {}

  buildScheduledEnvelope(input: BuildScheduledEnvelopeInput): IngressTriggerEnvelope {
    const occurredAt = input.occurredAt;
    const receivedAt = input.receivedAt ?? this.now().toISOString();
    const payload = input.payload ?? {
      schedule_id: input.schedule.id,
      trigger: input.schedule.trigger,
      payload_template_ref: input.schedule.payloadTemplateRef ?? null,
      occurred_at: occurredAt,
    };

    return {
      trigger_id: input.triggerId ?? randomUUID(),
      trigger_type: 'scheduler',
      source_id: `schedule:${input.schedule.id}`,
      project_id: input.schedule.projectId,
      workflow_ref: input.schedule.workflowDefinitionId,
      workmode_id: input.schedule.workmodeId,
      event_name: 'scheduled_run',
      payload_ref: buildPayloadRef(payload),
      idempotency_key: `schedule:${input.schedule.id}:${occurredAt}`,
      nonce: input.nonce ?? randomUUID(),
      occurred_at: occurredAt,
      received_at: receivedAt,
      auth_context_ref: 'internal:scheduler',
      trace_parent: input.traceParent ?? null,
      requested_delivery_mode: input.schedule.requestedDeliveryMode,
    };
  }

  buildEventEnvelope(input: BuildEventEnvelopeInput): IngressTriggerEnvelope {
    const occurredAt = input.occurredAt ?? this.now().toISOString();
    const receivedAt = input.receivedAt ?? this.now().toISOString();

    return {
      trigger_id: input.triggerId ?? randomUUID(),
      trigger_type: input.triggerType,
      source_id: input.sourceId,
      project_id: input.projectId,
      workflow_ref: input.workflowRef,
      workmode_id: input.workmodeId,
      event_name: input.eventName,
      payload_ref: buildPayloadRef(input.payload ?? {}),
      idempotency_key: input.idempotencyKey,
      nonce: input.nonce ?? randomUUID(),
      occurred_at: occurredAt,
      received_at: receivedAt,
      auth_context_ref:
        input.authContextRef ??
        (input.triggerType === 'hook' ? 'internal:scheduler' : 'internal:system'),
      trace_parent: input.traceParent ?? null,
      requested_delivery_mode: input.requestedDeliveryMode ?? 'none',
    };
  }
}
