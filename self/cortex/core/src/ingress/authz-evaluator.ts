/**
 * Ingress authorization evaluator implementation.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Evaluates workflow binding, event allowlist, policy.
 */
import type {
  IngressTriggerEnvelope,
  IngressAuthzResult,
  IngressCredentialScope,
} from '@nous/shared';
import type { IIngressAuthzEvaluator } from '@nous/shared';

export interface IngressAuthzEvaluatorOptions {
  /** Credential scopes for webhook keys. When absent, all webhooks denied. */
  credentialScopes?: Map<string, IngressCredentialScope>;
  /** Policy: allow external triggers for project/workflow. When absent, allow. */
  allowExternalTrigger?: (projectId: string, workflowRef: string) => boolean;
}

export class IngressAuthzEvaluator implements IIngressAuthzEvaluator {
  constructor(private readonly options: IngressAuthzEvaluatorOptions = {}) {}

  async evaluate(
    envelope: IngressTriggerEnvelope,
    auth_context_ref: string,
  ): Promise<IngressAuthzResult> {
    const { project_id, workflow_ref, event_name, trigger_type } = envelope;

    // Scheduler, hook, system_event: internal — allow (policy check only)
    if (
      trigger_type === 'scheduler' ||
      trigger_type === 'hook' ||
      trigger_type === 'system_event'
    ) {
      if (this.options.allowExternalTrigger) {
        if (!this.options.allowExternalTrigger(project_id, workflow_ref)) {
          return { allowed: false, reason: 'policy_blocked' };
        }
      }
      return { allowed: true };
    }

    // Webhook: must have credential scope matching project/workflow/event
    if (trigger_type === 'webhook') {
      const scopes = this.options.credentialScopes;
      if (!scopes) {
        return { allowed: false, reason: 'policy_blocked' };
      }
      const keyId = auth_context_ref.split(':')[1] ?? auth_context_ref;
      const scope = scopes.get(keyId);
      if (!scope) {
        return { allowed: false, reason: 'scope_mismatch' };
      }
      if (scope.project_id !== project_id || scope.workflow_ref !== workflow_ref) {
        return { allowed: false, reason: 'scope_mismatch' };
      }
      if (!scope.allowed_event_names.includes(event_name)) {
        return { allowed: false, reason: 'event_forbidden' };
      }
      if (this.options.allowExternalTrigger) {
        if (!this.options.allowExternalTrigger(project_id, workflow_ref)) {
          return { allowed: false, reason: 'policy_blocked' };
        }
      }
    }

    return { allowed: true };
  }
}
