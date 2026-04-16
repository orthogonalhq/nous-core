// ---------------------------------------------------------------------------
// cards/index.ts — Card registration and exports
// ---------------------------------------------------------------------------
// Importing this module registers all 5 card types with the adapter registry
// at module evaluation time. This is the only import consumers need to ensure
// all cards are available for rendering.
// ---------------------------------------------------------------------------

import { registerNousCard } from '../openui-adapter'
import type { NousCardDefinition } from '../openui-adapter'

import { StatusCardSchema, StatusCard } from './status-card'
import { ActionCardSchema, ActionCard } from './action-card'
import { ApprovalCardSchema, ApprovalCard } from './approval-card'
import { WorkflowCardSchema, WorkflowCard } from './workflow-card'
import { FollowUpBlockSchema, FollowUpBlock } from './follow-up-block'

// ---------------------------------------------------------------------------
// Card definitions
// ---------------------------------------------------------------------------

const cardDefinitions: NousCardDefinition[] = [
  {
    name: 'StatusCard',
    description: 'Displays status information with optional progress indicator',
    propsSchema: StatusCardSchema,
    renderer: StatusCard,
  },
  {
    name: 'ActionCard',
    description: 'Presents action buttons for user interaction',
    propsSchema: ActionCardSchema,
    renderer: ActionCard,
  },
  {
    name: 'ApprovalCard',
    description: 'Approval request with tier-based security controls',
    propsSchema: ApprovalCardSchema,
    renderer: ApprovalCard,
  },
  {
    name: 'WorkflowCard',
    description: 'Workflow status and management controls',
    propsSchema: WorkflowCardSchema,
    renderer: WorkflowCard,
  },
  {
    name: 'FollowUpBlock',
    description: 'Follow-up suggestion pills for conversation continuation',
    propsSchema: FollowUpBlockSchema,
    renderer: FollowUpBlock,
  },
]

// ---------------------------------------------------------------------------
// Register all cards at module evaluation time
// ---------------------------------------------------------------------------

for (const definition of cardDefinitions) {
  registerNousCard(definition)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { StatusCardSchema, type StatusCardProps } from './status-card'
export { ActionCardSchema, type ActionCardProps } from './action-card'
export { ApprovalCardSchema, type ApprovalCardProps } from './approval-card'
export { WorkflowCardSchema, type WorkflowCardProps } from './workflow-card'
export { FollowUpBlockSchema, type FollowUpBlockProps } from './follow-up-block'
