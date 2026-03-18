export interface TelegramAcknowledgeEscalationInput {
  escalation_id: string;
  binding_id: string;
  message_id: string;
  acknowledgement_token: string;
}

export const runAcknowledgeEscalationTool = (
  input: TelegramAcknowledgeEscalationInput,
) => ({
  acknowledged: true,
  escalation_id: input.escalation_id,
  binding_id: input.binding_id,
  message_id: input.message_id,
  acknowledgement_token: input.acknowledgement_token,
});
