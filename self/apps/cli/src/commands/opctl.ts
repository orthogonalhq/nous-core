/**
 * Opctl CLI commands — operator control command submission and confirmation proof.
 */
import type { CliTrpcClient } from '../trpc-client.js';

export interface OpctlRequestProofOptions {
  scope: {
    kind: string;
    scopeClass: string;
    projectId?: string;
  };
  action: string;
  tier: string;
  reason?: string;
  json?: boolean;
}

export async function runOpctlRequestProof(
  client: CliTrpcClient,
  options: OpctlRequestProofOptions,
): Promise<number> {
  try {
    const proof = await client.opctl.requestConfirmationProof.mutate({
      scope: {
        class: options.scope.scopeClass as 'nous_scope' | 'project_run_scope' | 'execution_scope',
        kind: options.scope.kind as 'single_agent' | 'agent_set' | 'project_run',
        target_ids: [],
        project_id: options.scope.projectId as import('@nous/shared').ProjectId | undefined,
      },
      action: options.action as import('@nous/shared').ControlAction,
      tier: options.tier as import('@nous/shared').ConfirmationTier,
      reason: options.reason,
    });

    if (options.json) {
      console.log(JSON.stringify(proof, null, 2));
      return 0;
    }

    console.log(`Proof ID: ${proof.proof_id}`);
    console.log(`Action: ${proof.action} (${proof.tier})`);
    console.log(`Expires: ${proof.expires_at}`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return 1;
  }
}
