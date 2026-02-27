/**
 * Chat intent classifier implementation (stub).
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * PCP-005: Ambiguous high-impact intents fail closed to clarification path.
 */
import type { ChatTurnEnvelope, ChatIntentClass } from '@nous/shared';
import type { IChatIntentClassifier } from '@nous/shared';

export class ChatIntentClassifier implements IChatIntentClassifier {
  async classify(
    _envelope: ChatTurnEnvelope,
    scopeResolved: boolean,
  ): Promise<{ intent: ChatIntentClass; confidence: number }> {
    // Stub: always returns conversational with high confidence when scope resolved
    // When scope not resolved, returns ambiguous (fail-closed)
    if (!scopeResolved) {
      return { intent: 'ambiguous', confidence: 0 };
    }
    return { intent: 'conversational', confidence: 0.9 };
  }
}
