import type {
  NudgeAcceptanceRouteRequest,
  NudgeAcceptanceRouteResult,
} from '@nous/shared';
import {
  NudgeAcceptanceRouteRequestSchema,
  NudgeAcceptanceRouteResultSchema,
} from '@nous/shared';

export class AcceptanceRouter {
  async route(
    input: NudgeAcceptanceRouteRequest,
  ): Promise<NudgeAcceptanceRouteResult> {
    const parsed = NudgeAcceptanceRouteRequestSchema.parse(input);

    switch (parsed.source_type) {
      case 'marketplace_package':
        return NudgeAcceptanceRouteResultSchema.parse({
          route: 'runtime_authorization_required',
          lifecycle_request_ref: `lifecycle-intent:${parsed.source_ref}:${parsed.candidate_id}`,
          reason_codes: ['NDG-ACCEPTANCE-ROUTED-RUNTIME-AUTH'],
          evidence_refs: parsed.evidence_refs,
        });
      case 'workflow_template':
        return NudgeAcceptanceRouteResultSchema.parse({
          route: 'workflow_template_draft',
          advisory_ref: `workflow-draft:${parsed.source_ref}:${parsed.candidate_id}`,
          reason_codes: ['NDG-ACCEPTANCE-RECORDED-ADVISORY'],
          evidence_refs: parsed.evidence_refs,
        });
      case 'runtime_tip':
      case 'first_party_guidance':
      default:
        return NudgeAcceptanceRouteResultSchema.parse({
          route: 'advisory_acknowledged',
          advisory_ref: `advisory:${parsed.source_ref}:${parsed.candidate_id}`,
          reason_codes: ['NDG-ACCEPTANCE-RECORDED-ADVISORY'],
          evidence_refs: parsed.evidence_refs,
        });
    }
  }
}
