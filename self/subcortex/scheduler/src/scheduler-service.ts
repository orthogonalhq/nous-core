import { randomUUID } from 'node:crypto';
import type {
  IIngressGateway,
  IProjectStore,
  ITaskStore,
  IngressDispatchOutcome,
  ProjectConfig,
  ProjectId,
  ScheduleDefinition,
  ScheduleUpsertInput,
  WorkflowDefinitionId,
} from '@nous/shared';
import { ScheduleDefinitionSchema, ScheduleUpsertInputSchema } from '@nous/shared';
import { DocumentScheduleStore } from './document-schedule-store.js';
import {
  IngressEnvelopeBuilder,
  type BuildEventEnvelopeInput,
} from './ingress-envelope-builder.js';

type CronMatcher = (value: number) => boolean;

export interface SchedulerServiceOptions {
  scheduleStore: DocumentScheduleStore;
  projectStore: IProjectStore;
  taskStore?: ITaskStore;
  ingressGateway: IIngressGateway;
  envelopeBuilder?: IngressEnvelopeBuilder;
  now?: () => Date;
}

export interface ScheduledDispatchResult {
  schedule: ScheduleDefinition;
  outcome: IngressDispatchOutcome;
}

export interface EventDispatchInput {
  projectId: ProjectId;
  workflowDefinitionId?: WorkflowDefinitionId;
  workmodeId: ScheduleDefinition['workmodeId'];
  sourceId: string;
  eventName: string;
  idempotencyKey: string;
  payload?: unknown;
  occurredAt?: string;
  traceParent?: string | null;
  requestedDeliveryMode?: ScheduleDefinition['requestedDeliveryMode'];
}

function parseTimestamp(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return parsed;
}

function normalizeDayOfWeek(value: number): number {
  return value === 7 ? 0 : value;
}

function parseCronMatcher(
  field: string,
  min: number,
  max: number,
  normalize: (value: number) => number = (value) => value,
): CronMatcher {
  const segments = field.split(',');
  const matchers = segments.map((segment) => {
    if (segment === '*') {
      return (_value: number) => true;
    }

    const step = segment.match(/^\*\/(\d+)$/);
    if (step) {
      const stride = Number(step[1]);
      if (!Number.isInteger(stride) || stride <= 0) {
        throw new Error(`Invalid cron step: ${segment}`);
      }
      return (value: number) => (normalize(value) - min) % stride === 0;
    }

    const rangeStep = segment.match(/^(\d+)-(\d+)\/(\d+)$/);
    if (rangeStep) {
      const start = Number(rangeStep[1]);
      const end = Number(rangeStep[2]);
      const stride = Number(rangeStep[3]);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        !Number.isInteger(stride) ||
        stride <= 0
      ) {
        throw new Error(`Invalid cron range step: ${segment}`);
      }
      return (value: number) => {
        const normalized = normalize(value);
        return normalized >= start && normalized <= end && (normalized - start) % stride === 0;
      };
    }

    const range = segment.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        throw new Error(`Invalid cron range: ${segment}`);
      }
      return (value: number) => {
        const normalized = normalize(value);
        return normalized >= start && normalized <= end;
      };
    }

    const literal = Number(segment);
    if (!Number.isInteger(literal)) {
      throw new Error(`Invalid cron field token: ${segment}`);
    }
    const normalizedLiteral = normalize(literal);
    return (value: number) => normalize(value) === normalizedLiteral;
  });

  return (value: number) => {
    const normalized = normalize(value);
    if (normalized < min || normalized > max) {
      return false;
    }
    return matchers.some((matcher) => matcher(normalized));
  };
}

function parseCronExpression(expression: string): {
  minute: CronMatcher;
  hour: CronMatcher;
  dayOfMonth: CronMatcher;
  month: CronMatcher;
  dayOfWeek: CronMatcher;
} {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  return {
    minute: parseCronMatcher(parts[0], 0, 59),
    hour: parseCronMatcher(parts[1], 0, 23),
    dayOfMonth: parseCronMatcher(parts[2], 1, 31),
    month: parseCronMatcher(parts[3], 1, 12),
    dayOfWeek: parseCronMatcher(parts[4], 0, 6, normalizeDayOfWeek),
  };
}

function computeNextCronOccurrence(expression: string, fromIso: string): string {
  const cron = parseCronExpression(expression);
  const candidate = new Date(parseTimestamp(fromIso));
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let index = 0; index < 366 * 24 * 60; index += 1) {
    if (
      cron.minute(candidate.getUTCMinutes()) &&
      cron.hour(candidate.getUTCHours()) &&
      cron.dayOfMonth(candidate.getUTCDate()) &&
      cron.month(candidate.getUTCMonth() + 1) &&
      cron.dayOfWeek(candidate.getUTCDay())
    ) {
      return candidate.toISOString();
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error(`Unable to compute next cron occurrence: ${expression}`);
}

function isTimeSchedule(
  schedule: ScheduleDefinition,
): schedule is ScheduleDefinition & {
  trigger: Extract<ScheduleDefinition['trigger'], { kind: 'cron' | 'calendar' }>;
} {
  return schedule.trigger.kind === 'cron' || schedule.trigger.kind === 'calendar';
}

export class SchedulerService {
  private readonly envelopeBuilder: IngressEnvelopeBuilder;
  private readonly now: () => Date;

  constructor(private readonly options: SchedulerServiceOptions) {
    this.envelopeBuilder = options.envelopeBuilder ?? new IngressEnvelopeBuilder(options.now);
    this.now = options.now ?? (() => new Date());
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private async loadProject(projectId: ProjectId): Promise<ProjectConfig> {
    const project = await this.options.projectStore.get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return project;
  }

  private resolveWorkflowDefinitionId(
    projectConfig: ProjectConfig,
    workflowDefinitionId?: WorkflowDefinitionId,
  ): WorkflowDefinitionId {
    const workflowConfig = projectConfig.workflow;
    if (!workflowConfig || workflowConfig.definitions.length === 0) {
      throw new Error(`Project ${projectConfig.id} has no workflow definitions`);
    }

    if (workflowDefinitionId) {
      const found = workflowConfig.definitions.find(
        (definition) => definition.id === workflowDefinitionId,
      );
      if (!found) {
        throw new Error(
          `Workflow definition ${workflowDefinitionId} not found for project ${projectConfig.id}`,
        );
      }
      return workflowDefinitionId;
    }

    if (workflowConfig.defaultWorkflowDefinitionId) {
      return workflowConfig.defaultWorkflowDefinitionId;
    }

    if (workflowConfig.definitions.length === 1) {
      return workflowConfig.definitions[0].id;
    }

    throw new Error(
      `Project ${projectConfig.id} requires workflowDefinitionId when multiple workflows exist`,
    );
  }

  private computeInitialNextDueAt(schedule: ScheduleDefinition, referenceTime: string): string | null {
    if (!schedule.enabled) {
      return null;
    }

    if (schedule.trigger.kind === 'calendar') {
      if (schedule.lastDispatchedAt) {
        return null;
      }
      return schedule.trigger.execute_at;
    }

    if (schedule.trigger.kind === 'cron') {
      return computeNextCronOccurrence(schedule.trigger.cron, referenceTime);
    }

    return null;
  }

  private async reconcileTimeSchedules(referenceTime: string): Promise<void> {
    const schedules = await this.options.scheduleStore.listAll();
    for (const schedule of schedules) {
      if (!schedule.enabled || !isTimeSchedule(schedule)) {
        continue;
      }

      if (
        schedule.nextDueAt == null ||
        (schedule.lastDispatchedAt != null &&
          schedule.nextDueAt <= schedule.lastDispatchedAt)
      ) {
        await this.options.scheduleStore.save({
          ...schedule,
          nextDueAt: this.computeInitialNextDueAt(
            schedule,
            schedule.lastDispatchedAt ?? referenceTime,
          ),
          updatedAt: referenceTime,
        });
      }
    }
  }

  private advanceAfterSubmission(
    schedule: ScheduleDefinition,
    processedAt: string,
    outcome: IngressDispatchOutcome,
  ): ScheduleDefinition {
    if (schedule.trigger.kind === 'calendar') {
      return {
        ...schedule,
        enabled: false,
        nextDueAt: null,
        lastDispatchedAt:
          outcome.outcome === 'rejected' ? schedule.lastDispatchedAt : processedAt,
        updatedAt: processedAt,
      };
    }

    if (schedule.trigger.kind === 'cron') {
      return {
        ...schedule,
        nextDueAt: computeNextCronOccurrence(schedule.trigger.cron, processedAt),
        lastDispatchedAt:
          outcome.outcome === 'rejected' ? schedule.lastDispatchedAt : processedAt,
        updatedAt: processedAt,
      };
    }

    return {
      ...schedule,
      updatedAt: processedAt,
    };
  }

  async register(schedule: ScheduleDefinition): Promise<string> {
    const timestamp = this.nowIso();
    const project = await this.loadProject(schedule.projectId);

    let workflowDefinitionId = schedule.workflowDefinitionId;

    // Branch: task schedule vs workflow schedule
    if (schedule.taskDefinitionId) {
      // Validate task exists via taskStore
      if (!this.options.taskStore) {
        throw new Error('taskStore required for task schedules');
      }
      const task = await this.options.taskStore.get(schedule.projectId, schedule.taskDefinitionId);
      if (!task) {
        throw new Error(
          `Task definition ${schedule.taskDefinitionId} not found in project ${schedule.projectId}`,
        );
      }
      // Skip resolveWorkflowDefinitionId for task schedules
    } else {
      // Existing workflow path
      workflowDefinitionId = this.resolveWorkflowDefinitionId(
        project,
        schedule.workflowDefinitionId,
      );
    }

    const normalized = ScheduleDefinitionSchema.parse({
      ...schedule,
      workflowDefinitionId,
      createdAt: schedule.createdAt ?? timestamp,
      updatedAt: timestamp,
      nextDueAt:
        schedule.nextDueAt ??
        this.computeInitialNextDueAt(schedule as ScheduleDefinition, timestamp),
    });

    await this.options.scheduleStore.save(normalized);
    return normalized.id;
  }

  async upsert(input: ScheduleUpsertInput): Promise<ScheduleDefinition> {
    const normalizedInput = ScheduleUpsertInputSchema.parse(input);
    const timestamp = this.nowIso();
    const scheduleId = normalizedInput.id ?? randomUUID();
    const existing = normalizedInput.id
      ? await this.options.scheduleStore.get(normalizedInput.id)
      : null;
    const project = await this.loadProject(normalizedInput.projectId);

    // Resolve the effective taskDefinitionId (from input or existing schedule)
    const effectiveTaskDefinitionId =
      normalizedInput.taskDefinitionId ?? existing?.taskDefinitionId;

    let workflowDefinitionId: WorkflowDefinitionId | undefined;

    // Branch: task schedule vs workflow schedule
    if (effectiveTaskDefinitionId) {
      // Validate task exists via taskStore
      if (!this.options.taskStore) {
        throw new Error('taskStore required for task schedules');
      }
      const task = await this.options.taskStore.get(normalizedInput.projectId, effectiveTaskDefinitionId);
      if (!task) {
        throw new Error(
          `Task definition ${effectiveTaskDefinitionId} not found in project ${normalizedInput.projectId}`,
        );
      }
      // Skip resolveWorkflowDefinitionId for task schedules
    } else {
      workflowDefinitionId = this.resolveWorkflowDefinitionId(
        project,
        normalizedInput.workflowDefinitionId ?? existing?.workflowDefinitionId,
      );
    }

    const merged = ScheduleDefinitionSchema.parse({
      id: scheduleId,
      projectId: normalizedInput.projectId,
      workflowDefinitionId,
      taskDefinitionId: effectiveTaskDefinitionId,
      workmodeId:
        normalizedInput.workmodeId ??
        existing?.workmodeId ??
        ('system:implementation' as ScheduleDefinition['workmodeId']),
      trigger: normalizedInput.trigger,
      enabled: normalizedInput.enabled,
      requestedDeliveryMode:
        normalizedInput.requestedDeliveryMode ?? existing?.requestedDeliveryMode,
      payloadTemplateRef:
        normalizedInput.payloadTemplateRef ?? existing?.payloadTemplateRef,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastDispatchedAt: existing?.lastDispatchedAt,
      nextDueAt: this.computeInitialNextDueAt(
        {
          ...existing,
          ...normalizedInput,
          id: scheduleId,
          workflowDefinitionId,
          workmodeId:
            normalizedInput.workmodeId ??
            existing?.workmodeId ??
            ('system:implementation' as ScheduleDefinition['workmodeId']),
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        } as ScheduleDefinition,
        existing?.lastDispatchedAt ?? timestamp,
      ),
    });

    await this.options.scheduleStore.save(merged);
    return merged;
  }

  async get(scheduleId: string): Promise<ScheduleDefinition | null> {
    return this.options.scheduleStore.get(scheduleId);
  }

  async cancel(scheduleId: string): Promise<boolean> {
    return this.options.scheduleStore.cancel(scheduleId, this.nowIso());
  }

  async list(projectId: ProjectId): Promise<ScheduleDefinition[]> {
    return this.options.scheduleStore.listByProject(projectId);
  }

  async dispatchDueSchedules(referenceTime = this.nowIso()): Promise<ScheduledDispatchResult[]> {
    await this.reconcileTimeSchedules(referenceTime);
    const dueSchedules = await this.options.scheduleStore.listDue(referenceTime);
    const results: ScheduledDispatchResult[] = [];

    for (const schedule of dueSchedules) {
      const occurredAt = schedule.nextDueAt ?? referenceTime;
      const outcome = await this.options.ingressGateway.submit(
        this.envelopeBuilder.buildScheduledEnvelope({
          schedule,
          occurredAt,
          receivedAt: referenceTime,
        }),
      );

      const updated = this.advanceAfterSubmission(schedule, referenceTime, outcome);
      await this.options.scheduleStore.save(updated);
      results.push({ schedule: updated, outcome });
    }

    return results;
  }

  private async dispatchEvent(
    input: EventDispatchInput,
    triggerType: BuildEventEnvelopeInput['triggerType'],
  ): Promise<IngressDispatchOutcome> {
    const project = await this.loadProject(input.projectId);
    const workflowDefinitionId = this.resolveWorkflowDefinitionId(
      project,
      input.workflowDefinitionId,
    );

    return this.options.ingressGateway.submit(
      this.envelopeBuilder.buildEventEnvelope({
        projectId: input.projectId,
        workflowRef: workflowDefinitionId,
        workmodeId: input.workmodeId,
        triggerType,
        sourceId: input.sourceId,
        eventName: input.eventName,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        occurredAt: input.occurredAt,
        traceParent: input.traceParent ?? null,
        requestedDeliveryMode: input.requestedDeliveryMode ?? 'none',
      }),
    );
  }

  async dispatchHookTrigger(input: EventDispatchInput): Promise<IngressDispatchOutcome> {
    return this.dispatchEvent(input, 'hook');
  }

  async dispatchSystemEvent(input: EventDispatchInput): Promise<IngressDispatchOutcome> {
    return this.dispatchEvent(input, 'system_event');
  }
}
