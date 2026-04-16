/**
 * TokenAccumulatorService — Cross-run token usage accumulator.
 *
 * Subscribes to inference:call-complete and inference:stream-complete events
 * to accumulate token usage across today/week/month windows. Emits periodic
 * inference:accumulator-snapshot events. In-memory only (V1) per ADR 3.
 */
import type { IEventBus, InferenceCallCompletePayload } from '@nous/shared';

export interface WindowSummary {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  windowStart: string;
}

export interface ProviderBreakdownEntry {
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

interface AccumulatorEntry {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

const DEFAULT_SNAPSHOT_INTERVAL_MS = 30_000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Monday = start of week
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export class TokenAccumulatorService {
  private todayAccum = new Map<string, AccumulatorEntry>();
  private weekAccum = new Map<string, AccumulatorEntry>();
  private monthAccum = new Map<string, AccumulatorEntry>();

  private todayStart: Date;
  private weekStart: Date;
  private monthStart: Date;

  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptionIds: string[] = [];
  private disposed = false;

  constructor(
    private readonly eventBus: IEventBus,
    options?: { snapshotIntervalMs?: number },
  ) {
    const now = new Date();
    this.todayStart = startOfDay(now);
    this.weekStart = startOfWeek(now);
    this.monthStart = startOfMonth(now);

    const callCompleteId = this.eventBus.subscribe('inference:call-complete', (payload) => {
      this.record(payload);
    });
    const streamCompleteId = this.eventBus.subscribe('inference:stream-complete', (payload) => {
      this.record(payload);
    });
    this.subscriptionIds.push(callCompleteId, streamCompleteId);

    const intervalMs = options?.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS;
    this.snapshotTimer = setInterval(() => {
      this.emitSnapshot();
    }, intervalMs);
  }

  private record(payload: InferenceCallCompletePayload): void {
    if (this.disposed) return;
    this.rotateWindowsIfNeeded();

    const { providerId, inputTokens, outputTokens } = payload;
    const input = inputTokens ?? 0;
    const output = outputTokens ?? 0;

    this.accumulate(this.todayAccum, providerId, input, output);
    this.accumulate(this.weekAccum, providerId, input, output);
    this.accumulate(this.monthAccum, providerId, input, output);
  }

  private accumulate(
    accum: Map<string, AccumulatorEntry>,
    providerId: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const existing = accum.get(providerId);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.callCount += 1;
    } else {
      accum.set(providerId, {
        inputTokens,
        outputTokens,
        callCount: 1,
      });
    }
  }

  private rotateWindowsIfNeeded(): void {
    const now = new Date();

    const currentDayStart = startOfDay(now);
    if (currentDayStart.getTime() > this.todayStart.getTime()) {
      this.todayAccum.clear();
      this.todayStart = currentDayStart;
    }

    const currentWeekStart = startOfWeek(now);
    if (currentWeekStart.getTime() > this.weekStart.getTime()) {
      this.weekAccum.clear();
      this.weekStart = currentWeekStart;
    }

    const currentMonthStart = startOfMonth(now);
    if (currentMonthStart.getTime() > this.monthStart.getTime()) {
      this.monthAccum.clear();
      this.monthStart = currentMonthStart;
    }
  }

  private summarizeWindow(accum: Map<string, AccumulatorEntry>, windowStart: Date): WindowSummary {
    let inputTokens = 0;
    let outputTokens = 0;
    let callCount = 0;
    for (const entry of accum.values()) {
      inputTokens += entry.inputTokens;
      outputTokens += entry.outputTokens;
      callCount += entry.callCount;
    }
    return { inputTokens, outputTokens, callCount, windowStart: windowStart.toISOString() };
  }

  getUsageSummary(): { today: WindowSummary; week: WindowSummary; month: WindowSummary } {
    this.rotateWindowsIfNeeded();
    return {
      today: this.summarizeWindow(this.todayAccum, this.todayStart),
      week: this.summarizeWindow(this.weekAccum, this.weekStart),
      month: this.summarizeWindow(this.monthAccum, this.monthStart),
    };
  }

  getProviderBreakdown(): ProviderBreakdownEntry[] {
    this.rotateWindowsIfNeeded();
    const entries: ProviderBreakdownEntry[] = [];
    for (const [providerId, entry] of this.todayAccum) {
      entries.push({
        providerId,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        callCount: entry.callCount,
      });
    }
    return entries;
  }

  private emitSnapshot(): void {
    if (this.disposed) return;
    const summary = this.getUsageSummary();
    const providerBreakdown: Record<string, { inputTokens: number; outputTokens: number; callCount: number }> = {};
    for (const [providerId, entry] of this.todayAccum) {
      providerBreakdown[providerId] = {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        callCount: entry.callCount,
      };
    }
    try {
      this.eventBus.publish('inference:accumulator-snapshot', {
        totalInputTokens: summary.today.inputTokens,
        totalOutputTokens: summary.today.outputTokens,
        providerBreakdown,
        windowStart: summary.today.windowStart,
        emittedAt: new Date().toISOString(),
      });
    } catch { /* fire-and-forget */ }
  }

  dispose(): void {
    this.disposed = true;
    if (this.snapshotTimer != null) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    for (const id of this.subscriptionIds) {
      this.eventBus.unsubscribe(id);
    }
    this.subscriptionIds = [];
  }
}
