/**
 * MaoProjectionService — IMaoProjectionService implementation.
 * Phase 2.6: Derives projections from canonical opctl state; stubs agent projections when run state unavailable.
 */
import type {
  ProjectId,
  MaoAgentProjection,
  MaoProjectControlProjection,
  MaoEventType,
  IOpctlService,
  IWitnessService,
} from '@nous/shared';
import { MaoProjectControlProjectionSchema } from '@nous/shared';

export interface MaoProjectionServiceDeps {
  opctlService: IOpctlService;
  witnessService?: IWitnessService;
}

export class MaoProjectionService {
  constructor(private deps: MaoProjectionServiceDeps) {}

  async getAgentProjections(projectId: ProjectId): Promise<MaoAgentProjection[]> {
    // Phase 2.6: Run/execution state not yet available; return empty array.
    // Full derivation from canonical event/state truth when run state exists (Phase 5).
    return [];
  }

  async getProjectControlProjection(
    projectId: ProjectId,
  ): Promise<MaoProjectControlProjection | null> {
    const controlState =
      await this.deps.opctlService.getProjectControlState(projectId);

    return MaoProjectControlProjectionSchema.parse({
      project_id: projectId,
      project_control_state: controlState,
      active_agent_count: 0,
      blocked_agent_count: 0,
      urgent_agent_count: 0,
      pfc_project_review_status: 'none',
      pfc_project_recommendation: 'continue',
    });
  }

  async emitProjectionEvent(
    eventType: MaoEventType,
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (this.deps.witnessService) {
      await this.deps.witnessService.appendAuthorization({
        actionCategory: 'mao-projection',
        actionRef: eventType,
        actor: 'system',
        status: 'approved',
        detail,
      });
    }
  }
}
