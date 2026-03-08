/**
 * CoreExecutor — ICoreExecutor implementation.
 *
 * 10-step single-turn cycle: input → context → Cortex → model → Cortex validate →
 * tool auth → memory candidates → Cortex gate → response → trace.
 */
import { NousError, ValidationError } from '@nous/shared';
import {
  TurnInputSchema,
  ExecutionTraceSchema,
  type ICoreExecutor,
  type IPfcEngine,
  type IWitnessService,
  type IOpctlService,
  type IModelRouter,
  type IModelProvider,
  type IToolExecutor,
  type IStmStore,
  type IProjectStore,
  type IDocumentStore,
  type IMemoryAccessPolicyEngine,
  type MemoryWriteCandidate,
  type MemoryMutationRequest,
  type MemoryEntryId,
  type ProjectId,
  type ProviderId,
  type TraceId,
  type ModelRole,
  type ExecutionTrace,
  type TurnResult,
  type PfcDecision,
  type StmContext,
  type TraceEvidenceReference,
  type CriticalActionCategory,
  type WitnessActor,
  type WitnessEventId,
  type InvariantCode,
  type EnforcementAction,
  type WitnessEvent,
  type RouteContext,
  type RouteResult,
  type RouteDecisionEvidence,
} from '@nous/shared';
import {
  isCrossProjectMemoryWrite,
  buildPolicyAccessContextForMemoryWrite,
} from '@nous/memory-access';
import { parseModelOutput } from './output-parser.js';

const TRACE_COLLECTION = 'execution_traces';
const DEFAULT_MODEL_ROLE: ModelRole = 'reasoner';

export interface MwcPipelineLike {
  submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null>;
  mutate(
    request: MemoryMutationRequest,
    projectId?: ProjectId,
  ): Promise<{ applied: boolean; reason: string; reasonCode: string }>;
}

const REDACTED = '[redacted]';

export interface CoreExecutorDeps {
  Cortex: IPfcEngine;
  router: IModelRouter;
  getProvider: (id: ProviderId) => IModelProvider | null;
  toolExecutor: IToolExecutor;
  stmStore: IStmStore;
  mwcPipeline: MwcPipelineLike;
  projectStore: IProjectStore;
  documentStore: IDocumentStore;
  witnessService: IWitnessService;
  /** Phase 2.5: Operator control service for start/admission gating. Optional for backward compat. */
  opctlService?: IOpctlService;
  /** Phase 3.3: Policy engine for cross-project memory access. Required for policy enforcement. */
  policyEngine: IMemoryAccessPolicyEngine;
  /** When false (default), redact sensitive fields before persisting trace */
  traceSensitiveData?: boolean;
}

export class CoreExecutor implements ICoreExecutor {
  constructor(private readonly deps: CoreExecutorDeps) {}

  async executeTurn(input: TurnInput): Promise<TurnResult> {
    const parsed = TurnInputSchema.safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid TurnInput', errors);
    }
    const validInput = parsed.data;

    const startedAt = new Date().toISOString();
    const projectId = validInput.projectId;
    const traceId = validInput.traceId;

    console.debug(
      `[nous:core] turn_start traceId=${traceId} projectId=${projectId ?? 'none'}`,
    );

    // Phase 2.5/2.6: MAO-007 — block turns when project is paused_review or hard_stopped
    if (projectId && this.deps.opctlService) {
      const controlState = await this.deps.opctlService.getProjectControlState(
        projectId,
      );
      if (controlState === 'paused_review' || controlState === 'hard_stopped') {
        console.info(
          `[nous:core] turn_blocked project_control_state=${controlState} projectId=${projectId} traceId=${traceId}`,
        );
        return {
          response: `[Project blocked by operator control (${controlState}).]`,
          traceId,
          memoryCandidates: [],
          pfcDecisions: [],
        };
      }
    }

    const turnData: TurnData = {
      input: validInput.message,
      output: '',
      modelCalls: [],
      pfcDecisions: [],
      toolDecisions: [],
      memoryWrites: [],
      memoryDenials: [],
      evidenceRefs: [],
      timestamp: startedAt,
    };

    try {
      let pipelinePaused = false;

      // Step 2: Context
      const stmContext: StmContext = validInput.stmContext ?? (projectId
        ? await this.deps.stmStore.getContext(projectId)
        : { entries: [], tokenCount: 0 });
      const _projectConfig = projectId
        ? await this.deps.projectStore.get(projectId)
        : null;
      const modelRole = DEFAULT_MODEL_ROLE;
      const prompt = buildPrompt(validInput.message, stmContext);

      // Step 4: Model
      const modelRequirements = validInput.modelRequirements ?? {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet' as const,
      };
      const routeContext: RouteContext = {
        traceId,
        projectId,
        modelRequirements,
        principalOverrideEvidence: validInput.principalOverrideEvidence,
      };

      let routeResult: RouteResult;
      try {
        routeResult = await this.deps.router.routeWithEvidence(
          modelRole,
          routeContext,
        );
      } catch (routeError) {
        const failoverCode = (routeError as NousError)?.context?.failoverReasonCode as
          | string
          | undefined;
        if (
          failoverCode === 'PRV-THRESHOLD-MISS' &&
          validInput.principalOverrideEvidence
        ) {
          routeResult = await this.deps.router.routeWithEvidence(modelRole, {
            ...routeContext,
            principalOverrideEvidence: true,
          });
        } else {
          throw routeError;
        }
      }

      const { providerId, evidence: routeEvidence } = routeResult;
      const provider = this.deps.getProvider(providerId);
      if (!provider) {
        throw new NousError(
          `Provider ${providerId} not found`,
          'PROVIDER_NOT_FOUND',
        );
      }

      const modelAuthorization = await this.authorizeCriticalAction({
        actionCategory: 'model-invoke',
        actionRef: providerId,
        actor: 'core',
        status: 'approved',
        detail: {
          role: modelRole,
          routeEvidence: routeEvidence as Record<string, unknown>,
        },
        traceId,
        projectId,
      });

      const modelRef: TraceEvidenceReference = {
        actionCategory: 'model-invoke',
        authorizationEventId: modelAuthorization.id,
      };

      let response: Awaited<ReturnType<IModelProvider['invoke']>>;
      const modelStart = Date.now();
      try {
        response = await provider.invoke({
          role: modelRole,
          input: { prompt },
          projectId,
          traceId,
        });
      } catch (error) {
        const failoverCode =
          error instanceof NousError
            ? (error.context?.failoverReasonCode as string | undefined)
            : undefined;
        const completionState = await this.handleCompletionFailure({
          actionCategory: 'model-invoke',
          actionRef: providerId,
          authorizationRef: modelAuthorization.id,
          actor: 'core',
          detail: {
            reason: normalizeErrorMessage(error),
            routeEvidence: routeEvidence as Record<string, unknown>,
            ...(failoverCode && { failoverReasonCode: failoverCode }),
          },
          traceId,
          projectId,
          turnData,
        });
        if (completionState === 'stop') {
          throw new NousError(
            'Critical action blocked by S0 invariant',
            'WITNESS_ENFORCEMENT_HARD_STOP',
          );
        }
        throw error;
      }
      const durationMs = Date.now() - modelStart;

      const modelCompletion = await this.completeCriticalAction({
        actionCategory: 'model-invoke',
        actionRef: providerId,
        authorizationRef: modelAuthorization.id,
        actor: 'core',
        status: 'succeeded',
        detail: {
          durationMs,
          routeEvidence: routeEvidence as Record<string, unknown>,
        },
        traceId,
        projectId,
      });

      modelRef.completionEventId = modelCompletion.id;
      turnData.evidenceRefs.push(modelRef);

      console.debug(
        `[nous:core] model_call providerId=${providerId} role=${modelRole}`,
      );

      turnData.modelCalls.push({
        providerId,
        role: modelRole,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        durationMs,
        routeEvidence,
      });

      // Step 5: Cortex reflect
      const reflection = await this.deps.Cortex.reflect(response.output, {
        output: response.output,
        projectId,
        traceId,
        tier: this.deps.Cortex.getTier(),
      });
      turnData.pfcDecisions.push({
        approved: !reflection.shouldEscalate,
        reason: reflection.notes ?? 'reflection',
        confidence: reflection.confidence,
      });

      // Step 6–9: Parse, tools, memory
      const parsed = parseModelOutput(
        response.output,
        traceId,
        validInput.message,
      );
      turnData.output = parsed.response;

      for (const tc of parsed.toolCalls) {
        if (pipelinePaused) {
          break;
        }

        const decision = await this.deps.Cortex.evaluateToolExecution(
          tc.name,
          tc.params,
          projectId,
        );
        turnData.toolDecisions.push({
          toolName: tc.name,
          approved: decision.approved,
          reason: decision.reason,
        });

        const toolAuthorization = await this.authorizeCriticalAction({
          actionCategory: 'tool-execute',
          actionRef: tc.name,
          actor: 'core',
          status: decision.approved ? 'approved' : 'denied',
          detail: {
            reason: decision.reason,
          },
          traceId,
          projectId,
        });

        const toolRef: TraceEvidenceReference = {
          actionCategory: 'tool-execute',
          authorizationEventId: toolAuthorization.id,
        };

        if (!decision.approved) {
          const blockedCompletion = await this.completeCriticalAction({
            actionCategory: 'tool-execute',
            actionRef: tc.name,
            authorizationRef: toolAuthorization.id,
            actor: 'core',
            status: 'blocked',
            detail: {
              reason: decision.reason,
            },
            traceId,
            projectId,
          });
          toolRef.completionEventId = blockedCompletion.id;
          turnData.evidenceRefs.push(toolRef);
          continue;
        }

        try {
          await this.deps.toolExecutor.execute(tc.name, tc.params, projectId);
          const toolCompletion = await this.completeCriticalAction({
            actionCategory: 'tool-execute',
            actionRef: tc.name,
            authorizationRef: toolAuthorization.id,
            actor: 'core',
            status: 'succeeded',
            detail: {},
            traceId,
            projectId,
          });
          toolRef.completionEventId = toolCompletion.id;
          turnData.evidenceRefs.push(toolRef);
        } catch (error) {
          const completionState = await this.handleCompletionFailure({
            actionCategory: 'tool-execute',
            actionRef: tc.name,
            authorizationRef: toolAuthorization.id,
            actor: 'core',
            detail: {
              reason: normalizeErrorMessage(error),
            },
            traceId,
            projectId,
            turnData,
          });

          if (completionState === 'stop') {
            throw new NousError(
              'Critical action blocked by S0 invariant',
              'WITNESS_ENFORCEMENT_HARD_STOP',
            );
          }

          pipelinePaused = true;
          turnData.pfcDecisions.push({
            approved: false,
            reason: 'S1 auto pause triggered for tool execution evidence',
            confidence: 1,
          });
          break;
        }
      }

      for (const candidate of parsed.memoryCandidates) {
        if (pipelinePaused) {
          break;
        }

        // Phase 3.3: Cross-project policy gate
        if (isCrossProjectMemoryWrite(candidate, projectId)) {
          if (projectId == null) {
            turnData.memoryDenials.push({
              candidate,
              reason: 'Cross-project write requires project context; deny-by-default',
            });
            continue;
          }
          const actingConfig = await this.deps.projectStore.get(projectId);
          const targetConfig =
            candidate.projectId != null && candidate.projectId !== projectId
              ? await this.deps.projectStore.get(candidate.projectId)
              : undefined;
          const controlState = this.deps.opctlService
            ? await this.deps.opctlService.getProjectControlState(projectId)
            : undefined;

          const policyCtx = buildPolicyAccessContextForMemoryWrite({
            candidate,
            actingProjectId: projectId,
            actingProjectConfig: actingConfig,
            targetProjectConfig: targetConfig ?? null,
            projectControlState: controlState,
            traceId,
          });

          if (policyCtx == null) {
            turnData.memoryDenials.push({
              candidate,
              reason: 'Policy config unavailable; deny-by-default',
            });
            const memoryAuthorization = await this.authorizeCriticalAction({
              actionCategory: 'memory-write',
              actionRef: candidate.type,
              actor: 'core',
              status: 'denied',
              detail: { reason: 'Policy config unavailable' },
              traceId,
              projectId,
            });
            const memoryRef: TraceEvidenceReference = {
              actionCategory: 'memory-write',
              authorizationEventId: memoryAuthorization.id,
            };
            turnData.evidenceRefs.push(memoryRef);
            continue;
          }

          const policyResult = this.deps.policyEngine.evaluate(policyCtx);
          if (!policyResult.allowed) {
            turnData.memoryDenials.push({
              candidate,
              reason: `${policyResult.reasonCode}: ${policyResult.reason}`,
              decisionRecord: policyResult.decisionRecord,
            });
            const memoryAuthorization = await this.authorizeCriticalAction({
              actionCategory: 'memory-write',
              actionRef: candidate.type,
              actor: 'core',
              status: 'denied',
              detail: { reason: policyResult.reason },
              traceId,
              projectId,
            });
            const memoryCompletion = await this.completeCriticalAction({
              actionCategory: 'memory-write',
              actionRef: candidate.type,
              authorizationRef: memoryAuthorization.id,
              actor: 'core',
              status: 'blocked',
              detail: { reason: policyResult.reason },
              traceId,
              projectId,
            });
            const memoryRef: TraceEvidenceReference = {
              actionCategory: 'memory-write',
              authorizationEventId: memoryAuthorization.id,
              completionEventId: memoryCompletion.id,
            };
            const reviewInvariant = await this.signalInvariant({
              code: 'MEM-POLICY-REVIEW',
              actionCategory: 'memory-write',
              actionRef: candidate.type,
              actor: 'system',
              detail: {
                description: 'memory write denied by policy',
                evidenceEventIds: [memoryAuthorization.id, memoryCompletion.id],
              },
              traceId,
              projectId,
            });
            const enforcement = this.applyInvariantOutcome(
              reviewInvariant,
              'MEM-POLICY-REVIEW',
              turnData,
            );
            if (reviewInvariant) {
              memoryRef.invariantEventId = reviewInvariant.id;
            }
            if (enforcement === 'stop') {
              throw new NousError(
                'Critical action blocked by S0 invariant',
                'WITNESS_ENFORCEMENT_HARD_STOP',
              );
            }
            if (enforcement === 'pause') {
              pipelinePaused = true;
            }
            turnData.evidenceRefs.push(memoryRef);
            continue;
          }
        }

        const decision = await this.deps.Cortex.evaluateMemoryWrite(
          candidate,
          projectId,
        );

        const memoryAuthorization = await this.authorizeCriticalAction({
          actionCategory: 'memory-write',
          actionRef: candidate.type,
          actor: 'core',
          status: decision.approved ? 'approved' : 'denied',
          detail: {
            reason: decision.reason,
          },
          traceId,
          projectId,
        });

        const memoryRef: TraceEvidenceReference = {
          actionCategory: 'memory-write',
          authorizationEventId: memoryAuthorization.id,
        };

        if (decision.approved) {
          try {
            const id = await this.deps.mwcPipeline.submit(candidate, projectId);
            if (id) {
              turnData.memoryWrites.push(id);
              const memoryCompletion = await this.completeCriticalAction({
                actionCategory: 'memory-write',
                actionRef: id,
                authorizationRef: memoryAuthorization.id,
                actor: 'core',
                status: 'succeeded',
                detail: {},
                traceId,
                projectId,
              });
              memoryRef.completionEventId = memoryCompletion.id;
            } else {
              turnData.memoryDenials.push({
                candidate,
                reason: decision.reason,
              });
              const memoryCompletion = await this.completeCriticalAction({
                actionCategory: 'memory-write',
                actionRef: candidate.type,
                authorizationRef: memoryAuthorization.id,
                actor: 'core',
                status: 'failed',
                detail: { reason: decision.reason },
                traceId,
                projectId,
              });
              memoryRef.completionEventId = memoryCompletion.id;
            }
          } catch (error) {
            turnData.memoryDenials.push({
              candidate,
              reason: 'MwcPipeline.submit failed',
            });

            const completionState = await this.handleCompletionFailure({
              actionCategory: 'memory-write',
              actionRef: candidate.type,
              authorizationRef: memoryAuthorization.id,
              actor: 'core',
              detail: {
                reason: normalizeErrorMessage(error),
              },
              traceId,
              projectId,
              turnData,
            });
            if (completionState === 'stop') {
              throw new NousError(
                'Critical action blocked by S0 invariant',
                'WITNESS_ENFORCEMENT_HARD_STOP',
              );
            }
            pipelinePaused = true;
            turnData.evidenceRefs.push(memoryRef);
            break;
          }
        } else {
          turnData.memoryDenials.push({
            candidate,
            reason: decision.reason,
          });
          const memoryCompletion = await this.completeCriticalAction({
            actionCategory: 'memory-write',
            actionRef: candidate.type,
            authorizationRef: memoryAuthorization.id,
            actor: 'core',
            status: 'blocked',
            detail: { reason: decision.reason },
            traceId,
            projectId,
          });
          memoryRef.completionEventId = memoryCompletion.id;

          const reviewInvariant = await this.signalInvariant({
            code: 'MEM-POLICY-REVIEW',
            actionCategory: 'memory-write',
            actionRef: candidate.type,
            actor: 'system',
            detail: {
              description: 'memory write denied and requires review',
              evidenceEventIds: [memoryAuthorization.id, memoryCompletion.id],
            },
            traceId,
            projectId,
          });
          const enforcement = this.applyInvariantOutcome(
            reviewInvariant,
            'MEM-POLICY-REVIEW',
            turnData,
          );
          if (reviewInvariant) {
            memoryRef.invariantEventId = reviewInvariant.id;
          }
          if (enforcement === 'stop') {
            throw new NousError(
              'Critical action blocked by S0 invariant',
              'WITNESS_ENFORCEMENT_HARD_STOP',
            );
          }
          if (enforcement === 'pause') {
            pipelinePaused = true;
          }
        }

        turnData.evidenceRefs.push(memoryRef);
      }
    } catch (err) {
      turnData.output = `[error: ${err instanceof Error ? err.message : String(err)}]`;
      console.info(
        `[nous:core] turn_complete traceId=${traceId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.finalizeStmTurn(projectId, validInput.message, turnData.output, traceId, turnData);
    const completedAt = new Date().toISOString();
    console.info(`[nous:core] turn_complete traceId=${traceId}`);

    let traceToPersist = {
      traceId,
      projectId,
      startedAt,
      completedAt,
      turns: [turnData],
    };

    if (!this.deps.traceSensitiveData) {
      traceToPersist = redactTrace(traceToPersist);
    }

    const traceValid = ExecutionTraceSchema.safeParse(traceToPersist);
    if (traceValid.success) {
      try {
        const traceAuthorization = await this.authorizeCriticalAction({
          actionCategory: 'trace-persist',
          actionRef: traceId,
          actor: 'core',
          status: 'approved',
          detail: {},
          traceId,
          projectId,
        });
        turnData.evidenceRefs.push({
          actionCategory: 'trace-persist',
          authorizationEventId: traceAuthorization.id,
        });

        // Rebuild with trace-persist auth reference now attached.
        traceToPersist = {
          traceId,
          projectId,
          startedAt,
          completedAt,
          turns: [turnData],
        };
        if (!this.deps.traceSensitiveData) {
          traceToPersist = redactTrace(traceToPersist);
        }

        const traceWithEvidence = ExecutionTraceSchema.parse(traceToPersist);
        await this.deps.documentStore.put(
          TRACE_COLLECTION,
          traceId,
          traceWithEvidence,
        );

        await this.completeCriticalAction({
          actionCategory: 'trace-persist',
          actionRef: traceId,
          authorizationRef: traceAuthorization.id,
          actor: 'core',
          status: 'succeeded',
          detail: {},
          traceId,
          projectId,
        });
        console.info(`[nous:core] trace_persisted traceId=${traceId}`);
      } catch (e) {
        console.error(
          `[nous:core] trace persist failed traceId=${traceId}`,
          e,
        );
      }
    }

    return {
      response: turnData.output,
      traceId,
      memoryCandidates: [],
      pfcDecisions: turnData.pfcDecisions,
    };
  }

  private async authorizeCriticalAction(input: {
    actionCategory: CriticalActionCategory;
    actionRef: string;
    actor: WitnessActor;
    status: 'approved' | 'denied';
    detail: Record<string, unknown>;
    traceId?: TraceId;
    projectId?: ProjectId;
  }): Promise<WitnessEvent> {
    try {
      return await this.deps.witnessService.appendAuthorization({
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        actor: input.actor,
        status: input.status,
        detail: input.detail,
        traceId: input.traceId,
        projectId: input.projectId,
      });
    } catch (error) {
      throw new NousError(
        `Critical action blocked: witness authorization append failed (${normalizeErrorMessage(error)})`,
        'WITNESS_AUTHORIZATION_FAILED',
      );
    }
  }

  private async completeCriticalAction(input: {
    actionCategory: CriticalActionCategory;
    actionRef: string;
    authorizationRef: WitnessEventId;
    actor: WitnessActor;
    status: 'succeeded' | 'failed' | 'blocked';
    detail: Record<string, unknown>;
    traceId?: TraceId;
    projectId?: ProjectId;
  }): Promise<WitnessEvent> {
    try {
      return await this.deps.witnessService.appendCompletion({
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        authorizationRef: input.authorizationRef,
        actor: input.actor,
        status: input.status,
        detail: input.detail,
        traceId: input.traceId,
        projectId: input.projectId,
      });
    } catch (error) {
      throw new NousError(
        `Critical action evidence completion failed (${normalizeErrorMessage(error)})`,
        'WITNESS_COMPLETION_FAILED',
      );
    }
  }

  private async signalInvariant(input: {
    code: InvariantCode;
    actionCategory: CriticalActionCategory;
    actionRef: string;
    actor: WitnessActor;
    detail: Record<string, unknown>;
    traceId?: TraceId;
    projectId?: ProjectId;
  }): Promise<WitnessEvent | null> {
    try {
      return await this.deps.witnessService.appendInvariant({
        code: input.code,
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        actor: input.actor,
        detail: input.detail,
        traceId: input.traceId,
        projectId: input.projectId,
      });
    } catch {
      return null;
    }
  }

  private applyInvariantOutcome(
    event: WitnessEvent | null,
    fallbackCode: InvariantCode,
    turnData: TurnData,
  ): 'continue' | 'pause' | 'stop' {
    const enforcement = resolveInvariantEnforcement(
      event?.detail.enforcement,
      fallbackCode,
    );

    if (enforcement === 'review') {
      turnData.pfcDecisions.push({
        approved: true,
        reason: `S2 review required for ${fallbackCode}`,
        confidence: 1,
      });
      return 'continue';
    }

    if (enforcement === 'auto-pause') {
      turnData.pfcDecisions.push({
        approved: false,
        reason: `S1 auto pause for ${fallbackCode}`,
        confidence: 1,
      });
      return 'pause';
    }

    turnData.pfcDecisions.push({
      approved: false,
      reason: `S0 hard stop for ${fallbackCode}`,
      confidence: 1,
    });
    return 'stop';
  }

  private async handleCompletionFailure(input: {
    actionCategory: CriticalActionCategory;
    actionRef: string;
    authorizationRef: WitnessEventId;
    actor: WitnessActor;
    detail: Record<string, unknown>;
    traceId?: TraceId;
    projectId?: ProjectId;
    turnData: TurnData;
  }): Promise<'continue' | 'pause' | 'stop'> {
    try {
      await this.completeCriticalAction({
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        authorizationRef: input.authorizationRef,
        actor: input.actor,
        status: 'failed',
        detail: input.detail,
        traceId: input.traceId,
        projectId: input.projectId,
      });
      return 'continue';
    } catch (error) {
      const invariant = await this.signalInvariant({
        code: 'EVID-COMPLETION-APPEND-FAILED',
        actionCategory: input.actionCategory,
        actionRef: input.actionRef,
        actor: 'system',
        detail: {
          ...input.detail,
          description: normalizeErrorMessage(error),
          evidenceEventIds: [input.authorizationRef],
        },
        traceId: input.traceId,
        projectId: input.projectId,
      });
      if (invariant) {
        input.turnData.evidenceRefs.push({
          actionCategory: input.actionCategory,
          invariantEventId: invariant.id,
        });
      }
      return this.applyInvariantOutcome(
        invariant,
        'EVID-COMPLETION-APPEND-FAILED',
        input.turnData,
      );
    }
  }

  async superviseProject(_projectId: ProjectId): Promise<void> {
    throw new NousError(
      'superviseProject not implemented (Phase 5)',
      'NOT_IMPLEMENTED',
    );
  }

  async getTrace(traceId: TraceId): Promise<ExecutionTrace | null> {
    const raw = await this.deps.documentStore.get<unknown>(
      TRACE_COLLECTION,
      traceId,
    );
    if (!raw) return null;
    const parsed = ExecutionTraceSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private async finalizeStmTurn(
    projectId: ProjectId | undefined,
    userMessage: string,
    assistantResponse: string,
    traceId: TraceId,
    turnData: TurnData,
  ): Promise<void> {
    if (!projectId) {
      return;
    }

    const timestamp = new Date().toISOString();
    try {
      await this.deps.stmStore.append(projectId, {
        role: 'user',
        content: userMessage,
        timestamp,
      });
      await this.deps.stmStore.append(projectId, {
        role: 'assistant',
        content: assistantResponse,
        timestamp,
      });

      const stmContext = await this.deps.stmStore.getContext(projectId);
      if (!stmContext.compactionState?.requiresCompaction) {
        return;
      }

      const mutation = await this.deps.mwcPipeline.mutate({
        action: 'compact-stm',
        actor: 'pfc',
        projectId,
        reason: 'Automatic STM compaction due to token threshold',
        traceId,
        evidenceRefs: [...turnData.evidenceRefs],
      });
      if (!mutation.applied) {
        console.warn(
          `[nous:core] stm_compaction_not_applied projectId=${projectId} reasonCode=${mutation.reasonCode} reason=${mutation.reason}`,
        );
      }
    } catch (error) {
      console.error(
        `[nous:core] stm_finalize_failed projectId=${projectId} traceId=${traceId}`,
        error,
      );
    }
  }
}

interface TurnData {
  input: string;
  output: string;
  modelCalls: Array<{
    providerId: ProviderId;
    role: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    routeEvidence?: RouteDecisionEvidence;
  }>;
  pfcDecisions: PfcDecision[];
  toolDecisions: Array<{ toolName: string; approved: boolean; reason?: string }>;
  memoryWrites: MemoryEntryId[];
  memoryDenials: Array<{
    candidate: MemoryWriteCandidate;
    reason: string;
    decisionRecord?: import('@nous/shared').PolicyDecisionRecord;
  }>;
  evidenceRefs: TraceEvidenceReference[];
  timestamp: string;
}

type TurnInput = Parameters<ICoreExecutor['executeTurn']>[0];

function redactTrace(trace: {
  traceId: TraceId;
  projectId: ProjectId | undefined;
  startedAt: string;
  completedAt: string;
  turns: TurnData[];
}): typeof trace {
  return {
    ...trace,
    turns: trace.turns.map((t) => ({
      ...t,
      input: REDACTED,
      output: REDACTED,
      toolDecisions: t.toolDecisions,
      memoryWrites: t.memoryWrites,
      memoryDenials: t.memoryDenials.map((d) => ({
        candidate: { ...d.candidate, content: REDACTED },
        reason: d.reason,
        ...(d.decisionRecord != null && { decisionRecord: d.decisionRecord }),
      })),
      evidenceRefs: t.evidenceRefs,
    })),
  };
}

function buildPrompt(message: string, stmContext: StmContext): string {
  const parts: string[] = [];
  if (stmContext.summary) {
    parts.push(`Summary: ${stmContext.summary}`);
  }
  for (const e of stmContext.entries ?? []) {
    parts.push(`${e.role}: ${e.content}`);
  }
  parts.push(`User: ${message}`);
  parts.push('Assistant:');
  return parts.join('\n\n');
}

function resolveInvariantEnforcement(
  enforcement: unknown,
  code: InvariantCode,
): EnforcementAction {
  if (
    enforcement === 'hard-stop' ||
    enforcement === 'auto-pause' ||
    enforcement === 'review'
  ) {
    return enforcement;
  }

  const prefix = code.split('-')[0];
  if (prefix === 'AUTH' || prefix === 'CHAIN' || prefix === 'ISO') {
    return 'hard-stop';
  }
  if (prefix === 'EVID') {
    return 'auto-pause';
  }
  if (prefix === 'MEM') {
    return 'review';
  }

  // Fail closed on unknown invariant families.
  return 'hard-stop';
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
