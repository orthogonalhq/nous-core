/**
 * WitnessService — IWitnessService implementation.
 */
import { randomUUID } from 'node:crypto';
import type {
  AttestationReceipt,
  IDocumentStore,
  IWitnessService,
  VerificationReport,
  VerificationReportId,
  WitnessAuthorizationInput,
  WitnessCheckpoint,
  WitnessCheckpointReason,
  WitnessCompletionInput,
  WitnessEvent,
  WitnessEventId,
  WitnessInvariantInput,
  WitnessVerificationRequest,
} from '@nous/shared';
import {
  AttestationReceiptSchema,
  VerificationReportSchema,
  WitnessCheckpointSchema,
  WitnessAuthorizationInputSchema,
  WitnessCompletionInputSchema,
  WitnessInvariantInputSchema,
  WitnessVerificationRequestSchema,
} from '@nous/shared';
import {
  ensureKeyEpoch,
  getKeyEpoch,
  signDigest,
  verifyDigestSignature,
} from './checkpoint.js';
import { createInvariantFinding, mapInvariantToEnforcement } from './invariants.js';
import {
  appendLedgerEvent,
  buildCheckpointHash,
  getEventById,
  getLatestCheckpoint,
  getLedgerHead,
  listCheckpoints,
  listEvents,
  saveCheckpoint,
  saveLedgerHead,
  WITNESS_REPORTS_COLLECTION,
} from './ledger.js';
import { hashCanonical } from './serialization.js';
import {
  collectInvariantEventFindings,
  countFindingsBySeverity,
  deriveVerificationStatus,
  filterCheckpointsByRange,
  filterEventsByRange,
  verifyCheckpointChain,
  verifyEventChain,
} from './verifier.js';

export interface WitnessServiceOptions {
  checkpointInterval?: number;
  now?: () => string;
  idFactory?: () => string;
}

export class WitnessService implements IWitnessService {
  private readonly checkpointInterval: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly documentStore: IDocumentStore,
    private readonly options: WitnessServiceOptions = {},
  ) {
    this.checkpointInterval = options.checkpointInterval ?? 25;
  }

  async appendAuthorization(
    input: WitnessAuthorizationInput,
  ): Promise<WitnessEvent> {
    const parsed = WitnessAuthorizationInputSchema.parse(input);
    return this.runExclusive(async () => {
      const now = this.now();
      const head = await getLedgerHead(this.documentStore, now);
      const { event, nextHead } = await appendLedgerEvent(
        this.documentStore,
        head,
        {
          eventId: this.nextId() as WitnessEventId,
          stage: 'authorization',
          actionCategory: parsed.actionCategory,
          actionRef: parsed.actionRef,
          traceId: parsed.traceId,
          projectId: parsed.projectId,
          actor: parsed.actor,
          status: parsed.status,
          detail: parsed.detail,
          occurredAt: parsed.occurredAt ?? now,
        },
        now,
      );
      await this.maybeIntervalCheckpoint(nextHead, now);
      return event;
    });
  }

  async appendCompletion(
    input: WitnessCompletionInput,
  ): Promise<WitnessEvent> {
    const parsed = WitnessCompletionInputSchema.parse(input);
    return this.runExclusive(async () => {
      const now = this.now();
      const authorization = await getEventById(
        this.documentStore,
        parsed.authorizationRef,
      );
      if (!authorization) {
        throw new Error(
          `Authorization event not found: ${parsed.authorizationRef}`,
        );
      }

      const head = await getLedgerHead(this.documentStore, now);
      const { event, nextHead } = await appendLedgerEvent(
        this.documentStore,
        head,
        {
          eventId: this.nextId() as WitnessEventId,
          stage: 'completion',
          actionCategory: parsed.actionCategory,
          actionRef: parsed.actionRef,
          authorizationRef: parsed.authorizationRef,
          traceId: parsed.traceId,
          projectId: parsed.projectId,
          actor: parsed.actor,
          status: parsed.status,
          detail: parsed.detail,
          occurredAt: parsed.occurredAt ?? now,
        },
        now,
      );
      await this.maybeIntervalCheckpoint(nextHead, now);
      return event;
    });
  }

  async appendInvariant(
    input: WitnessInvariantInput,
  ): Promise<WitnessEvent> {
    const parsed = WitnessInvariantInputSchema.parse(input);
    return this.runExclusive(async () => {
      const now = this.now();
      const mapped = mapInvariantToEnforcement(parsed.code);
      const head = await getLedgerHead(this.documentStore, now);

      const { event, nextHead } = await appendLedgerEvent(
        this.documentStore,
        head,
        {
          eventId: this.nextId() as WitnessEventId,
          stage: 'invariant',
          actionCategory: parsed.actionCategory,
          actionRef: parsed.actionRef,
          traceId: parsed.traceId,
          projectId: parsed.projectId,
          actor: parsed.actor,
          status: mapped.enforcement === 'hard-stop' ? 'blocked' : 'failed',
          invariantCode: parsed.code,
          detail: {
            ...parsed.detail,
            severity: mapped.severity,
            enforcement: mapped.enforcement,
          },
          occurredAt: parsed.occurredAt ?? now,
        },
        now,
      );
      await this.maybeIntervalCheckpoint(nextHead, now);
      return event;
    });
  }

  async createCheckpoint(
    reason: WitnessCheckpointReason = 'manual',
  ): Promise<WitnessCheckpoint> {
    return this.runExclusive(async () => {
      const now = this.now();
      const head = await getLedgerHead(this.documentStore, now);
      return this.createCheckpointInternal(reason, head, now);
    });
  }

  async rotateKeyEpoch(): Promise<number> {
    return this.runExclusive(async () => {
      const now = this.now();
      const head = await getLedgerHead(this.documentStore, now);
      const nextEpoch = head.activeKeyEpoch + 1;
      await ensureKeyEpoch(this.documentStore, nextEpoch, now);
      const nextHead = {
        ...head,
        activeKeyEpoch: nextEpoch,
        updatedAt: now,
      };
      await saveLedgerHead(this.documentStore, nextHead);

      if (nextHead.lastSequence > 0) {
        await this.createCheckpointInternal('rotation', nextHead, now);
      }
      return nextEpoch;
    });
  }

  async verify(
    request?: WitnessVerificationRequest,
  ): Promise<VerificationReport> {
    const parsed = WitnessVerificationRequestSchema.parse(request ?? {});
    const now = this.now();
    const events = await listEvents(this.documentStore);
    const checkpoints = await listCheckpoints(this.documentStore);

    const fromSequence = parsed.fromSequence ?? (events[0]?.sequence ?? 0);
    const toSequence = parsed.toSequence ?? (events[events.length - 1]?.sequence ?? 0);

    const rangeEvents = filterEventsByRange(events, fromSequence, toSequence);
    const rangeCheckpoints = filterCheckpointsByRange(
      checkpoints,
      fromSequence,
      toSequence,
    );

    const eventVerification = verifyEventChain(rangeEvents, now);
    const checkpointVerification = await verifyCheckpointChain(
      rangeCheckpoints,
      rangeEvents,
      now,
      async (checkpoint) => this.verifyCheckpointSignature(checkpoint),
    );

    const explicitInvariantFindings = collectInvariantEventFindings(
      rangeEvents,
      now,
    );
    const evidenceCompletenessFindings = this.findEvidenceCompletenessFindings(
      rangeEvents,
      now,
    );

    const findings = [
      ...explicitInvariantFindings,
      ...evidenceCompletenessFindings,
      ...eventVerification.findings,
      ...checkpointVerification.findings,
    ];
    const bySeverity = countFindingsBySeverity(findings);
    const status = deriveVerificationStatus(bySeverity);

    const reportWithoutReceipt = {
      id: this.nextId() as VerificationReportId,
      generatedAt: now,
      range: {
        fromSequence,
        toSequence,
      },
      ledger: {
        eventCount: rangeEvents.length,
        headEventHash: rangeEvents.length > 0
          ? rangeEvents[rangeEvents.length - 1]!.eventHash
          : null,
        sequenceContiguous: eventVerification.sequenceContiguous,
        hashChainValid: eventVerification.hashChainValid,
      },
      checkpoints: {
        checkpointCount: rangeCheckpoints.length,
        headCheckpointHash: rangeCheckpoints.length > 0
          ? rangeCheckpoints[rangeCheckpoints.length - 1]!.checkpointHash
          : null,
        checkpointChainValid: checkpointVerification.checkpointChainValid,
        signaturesValid: checkpointVerification.signaturesValid,
      },
      invariants: {
        findings,
        bySeverity,
      },
      status,
    };

    const subjectHash = hashCanonical(reportWithoutReceipt);
    const receipt = await this.issueAttestationReceipt(subjectHash, now);
    const report = VerificationReportSchema.parse({
      ...reportWithoutReceipt,
      receipt,
    });

    await this.documentStore.put(WITNESS_REPORTS_COLLECTION, report.id, report);
    return report;
  }

  async getReport(id: VerificationReportId): Promise<VerificationReport | null> {
    const raw = await this.documentStore.get<unknown>(WITNESS_REPORTS_COLLECTION, id);
    if (!raw) {
      return null;
    }
    const parsed = VerificationReportSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async listReports(limit = 20): Promise<VerificationReport[]> {
    const raw = await this.documentStore.query<unknown>(WITNESS_REPORTS_COLLECTION, {
      orderBy: 'generatedAt',
      orderDirection: 'desc',
      limit,
    });

    const reports: VerificationReport[] = [];
    for (const item of raw) {
      const parsed = VerificationReportSchema.safeParse(item);
      if (parsed.success) {
        reports.push(parsed.data);
      }
    }
    return reports;
  }

  async getLatestCheckpoint(): Promise<WitnessCheckpoint | null> {
    return getLatestCheckpoint(this.documentStore);
  }

  private async maybeIntervalCheckpoint(
    head: Awaited<ReturnType<typeof getLedgerHead>>,
    now: string,
  ): Promise<void> {
    if (head.lastSequence === 0) {
      return;
    }

    if (head.lastSequence % this.checkpointInterval !== 0) {
      return;
    }

    await this.createCheckpointInternal('interval', head, now);
  }

  private async createCheckpointInternal(
    reason: WitnessCheckpointReason,
    head: Awaited<ReturnType<typeof getLedgerHead>>,
    now: string,
  ): Promise<WitnessCheckpoint> {
    if (!head.lastEventHash || head.lastSequence === 0) {
      throw new Error('Cannot create checkpoint for empty witness ledger');
    }

    const latestCheckpoint = await getLatestCheckpoint(this.documentStore);
    const keyEpoch = head.activeKeyEpoch;
    const keyRecord = await ensureKeyEpoch(this.documentStore, keyEpoch, now);
    const checkpointSequence = head.lastCheckpointSequence + 1;

    const startEventSequence = latestCheckpoint
      ? Math.min(latestCheckpoint.endEventSequence + 1, head.lastSequence)
      : 1;
    const endEventSequence = head.lastSequence;

    const checkpointHash = buildCheckpointHash({
      checkpointSequence,
      startEventSequence,
      endEventSequence,
      previousCheckpointHash: latestCheckpoint?.checkpointHash ?? null,
      ledgerHeadHash: head.lastEventHash,
      keyEpoch,
      reason,
    });
    const signature = signDigest(checkpointHash, keyRecord.privateKeyPem);

    const checkpoint = WitnessCheckpointSchema.parse({
      id: this.nextId(),
      checkpointSequence,
      startEventSequence,
      endEventSequence,
      previousCheckpointHash: latestCheckpoint?.checkpointHash ?? null,
      checkpointHash,
      ledgerHeadHash: head.lastEventHash,
      keyEpoch,
      signatureAlgorithm: 'ed25519' as const,
      signature,
      reason,
      createdAt: now,
    });

    const nextHead = {
      ...head,
      lastCheckpointSequence: checkpointSequence,
      lastCheckpointHash: checkpointHash,
      updatedAt: now,
    };

    await saveCheckpoint(this.documentStore, checkpoint, nextHead);
    return checkpoint;
  }

  private async verifyCheckpointSignature(
    checkpoint: WitnessCheckpoint,
  ): Promise<boolean> {
    const keyRecord = await getKeyEpoch(this.documentStore, checkpoint.keyEpoch);
    if (!keyRecord) {
      return false;
    }
    return verifyDigestSignature(
      checkpoint.checkpointHash,
      checkpoint.signature,
      keyRecord.publicKeyPem,
    );
  }

  private findEvidenceCompletenessFindings(
    events: WitnessEvent[],
    detectedAt: string,
  ) {
    const findings = [];
    const authorizations = new Map(events
      .filter((event) => event.stage === 'authorization')
      .map((event) => [event.id, event]));
    const completions = events.filter((event) => event.stage === 'completion');
    const completionRefs = new Set(
      completions
        .map((event) => event.authorizationRef)
        .filter((ref): ref is WitnessEventId => Boolean(ref)),
    );

    for (const authorization of authorizations.values()) {
      if (!completionRefs.has(authorization.id)) {
        findings.push(
          createInvariantFinding({
            code: 'EVID-MISSING-COMPLETION',
            description: `authorization ${authorization.id} has no completion event`,
            evidenceEventIds: [authorization.id],
            detectedAt,
          }),
        );
      }
    }

    for (const completion of completions) {
      if (!completion.authorizationRef || !authorizations.has(completion.authorizationRef)) {
        findings.push(
          createInvariantFinding({
            code: 'EVID-MISSING-AUTHORIZATION',
            description: `completion ${completion.id} has no matching authorization event`,
            evidenceEventIds: [completion.id],
            detectedAt,
          }),
        );
      }
    }

    return findings;
  }

  private async issueAttestationReceipt(
    subjectHash: string,
    now: string,
  ): Promise<AttestationReceipt> {
    const head = await getLedgerHead(this.documentStore, now);
    const keyRecord = await ensureKeyEpoch(
      this.documentStore,
      head.activeKeyEpoch,
      now,
    );

    const signature = signDigest(subjectHash, keyRecord.privateKeyPem);
    const verified = verifyDigestSignature(
      subjectHash,
      signature,
      keyRecord.publicKeyPem,
    );

    return AttestationReceiptSchema.parse({
      id: this.nextId(),
      mode: 'local',
      subjectType: 'verification-report',
      subjectHash,
      keyEpoch: keyRecord.keyEpoch,
      signatureAlgorithm: 'ed25519',
      signature,
      verified,
      issuedAt: now,
    });
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
