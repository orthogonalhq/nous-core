/**
 * Card prompt fragment — teaches Worker agents how to produce OpenUI card output.
 * Canonical human-readable reference: self/ui/src/components/chat/cards/card-prompt-fragment.md
 *
 * This is extracted to its own file so that:
 * 1. Tests can import it without resolving the full gateway-turn-executor dependency tree.
 * 2. The constant is co-located with the gateway runtime but independently testable.
 */
export const CARD_PROMPT_FRAGMENT = `## Structured Response Cards

You can respond with interactive cards using OpenUI markup when the situation calls for structured interaction. Use the %%openui prefix to indicate card content.

### When to use cards:
- Presenting a decision that requires user approval or choice (ActionCard or ApprovalCard)
- Reporting operation status with progress (StatusCard)
- Summarizing a workflow with actionable options (WorkflowCard)
- Suggesting follow-up actions after completing a task (FollowUpBlock)

### When NOT to use cards:
- Simple conversational replies, explanations, or discussions
- Responses that are purely informational with no actionable component
- When the user asked a question that deserves a direct text answer
- Error messages or apologies -- use plain text

### Card type reference:
- StatusCard: { title, status: active|complete|error|waiting, message, detail?, progress? }
- ActionCard: { title, description, actions: [{ label, actionType, payload?, variant? }] }
- ApprovalCard: { title, description, tier: t1|t2|t3, command, context? }
- WorkflowCard: { title, workflowId, nodeCount?, status?, summary? }
- FollowUpBlock: { suggestions: [{ label, prompt?, actionType?, payload? }] }

### Format:
Prefix card responses with %%openui on its own line, then the card markup.
You may mix plain text and cards in a single response -- text before %%openui is rendered normally.`;
