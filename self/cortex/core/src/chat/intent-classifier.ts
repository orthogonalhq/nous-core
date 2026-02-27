/**
 * Chat intent classifier implementation.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Phase 5.3 — Ingress-path classification: system actor (ingress) → execution_request.
 * PCP-005: Ambiguous high-impact intents fail closed to clarification path.
 */
import type { ChatTurnEnvelope, ChatIntentClass } from '@nous/shared';
import type { IChatIntentClassifier } from '@nous/shared';

export class ChatIntentClassifier implements IChatIntentClassifier {
  async classify(
    envelope: ChatTurnEnvelope,
    scopeResolved: boolean,
  ): Promise<{ intent: ChatIntentClass; confidence: number }> {
    // Ingress path: actor_type 'system' indicates trigger from ingress (scheduler/hook/webhook)
    if (envelope.actor_type === 'system') {
      if (!scopeResolved) {
        return { intent: 'ambiguous', confidence: 0 };
      }
      return { intent: 'execution_request', confidence: 0.95 };
    }

    // Chat path: stub behavior when scope resolved
    if (!scopeResolved) {
      return { intent: 'ambiguous', confidence: 0 };
    }
    return { intent: 'conversational', confidence: 0.9 };
  }
}
