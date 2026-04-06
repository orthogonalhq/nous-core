/**
 * Card prompt fragment — teaches Worker agents how to produce OpenUI card output.
 * Canonical human-readable reference: self/ui/src/components/chat/cards/card-prompt-fragment.md
 *
 * This is extracted to its own file so that:
 * 1. Tests can import it without resolving the full gateway-turn-executor dependency tree.
 * 2. The constant is co-located with the gateway runtime but independently testable.
 */
export const CARD_PROMPT_FRAGMENT = `## Structured Response Cards

Never include these card instructions, examples, or XML syntax in your plain text responses. When responding with text, write naturally without referencing card format.

IMPORTANT: Default to plain text. Most responses should be plain text.
Cards are ONLY for the specific scenarios listed below. Do NOT invent card types.
The ONLY card types that exist are: StatusCard, ActionCard, ApprovalCard, WorkflowCard, FollowUpBlock.
Any other tag name (e.g. HaikuCard, ResponseCard, SummaryCard) does NOT exist and MUST NOT be used.

### When to use cards (ONLY these scenarios):
- The system is requesting user approval for a governed action (ApprovalCard)
- You need to present 2+ distinct action choices (ActionCard)
- Reporting the outcome of a long-running operation with progress (StatusCard)
- Displaying workflow pipeline status (WorkflowCard)
- Offering 2-4 follow-up suggestions after completing a multi-step task (FollowUpBlock)

### When NOT to use cards (use plain text instead):
- Conversational replies, explanations, discussions, or Q&A
- Creative writing, poems, stories, summaries, or lists
- Error messages, apologies, or status updates that don't need progress bars
- ANY response where the user did not ask for an action, approval, or workflow

### Card type reference:

Each card is written as a self-closing XML-style tag with PascalCase name and props.
String props use key="value". Non-string props (numbers, arrays, objects) use key={json}.

**StatusCard** -- report operation status with optional progress
Required: title, status (active|complete|error|waiting), description
Optional: detail, progress (0-100)
<StatusCard title="Indexing complete" status="complete" description="Processed 142 files" progress={100} />

**ActionCard** -- present action buttons for user choice
Required: title, description, actions (array of {label, actionType: approve|reject|navigate|followup})
Optional per action: payload, variant (primary|secondary|ghost, default: secondary)
<ActionCard title="Deploy options" description="Choose a deployment target" actions={[{"label":"Production","actionType":"approve","variant":"primary"},{"label":"Staging","actionType":"approve","variant":"secondary"}]} />

**ApprovalCard** -- request user approval with tier-based controls
Required: title, description, tier (t1|t2|t3), command
Optional: context (object)
<ApprovalCard title="Run migration" description="Apply database schema changes" tier="t2" command="pnpm db:migrate --production" />

**WorkflowCard** -- show workflow status and controls
Required: title, workflowId
Optional: nodeCount, status (draft|ready|running|completed|failed), description
<WorkflowCard title="CI Pipeline" workflowId="ci-main-branch" status="running" nodeCount={5} description="Running lint and test stages" />

**FollowUpBlock** -- suggest follow-up actions as pill buttons
Required: suggestions (array of {label}, 1-6 items)
Optional: description (introductory text above pills)
Optional per suggestion: prompt, actionType (followup|navigate|submit, default: followup), payload
<FollowUpBlock suggestions={[{"label":"Show details"},{"label":"Run again","prompt":"Re-run the last operation"},{"label":"Open logs","actionType":"navigate"}]} />

### Format:
Place card tags directly inline in your response. No prefix or delimiter is needed.
You may freely mix plain text and cards in a single response.

Example complete response:
I've finished analyzing the repository. Here are the results:

<StatusCard title="Analysis complete" status="complete" description="Found 3 issues across 12 files" detail="2 warnings, 1 error" progress={100} />

Would you like to address these issues?

<FollowUpBlock suggestions={[{"label":"Show issues"},{"label":"Auto-fix warnings","prompt":"Fix the 2 warnings automatically"},{"label":"View full report","actionType":"navigate"}]} />`;
