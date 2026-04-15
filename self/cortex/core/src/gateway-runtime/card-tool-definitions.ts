/**
 * Card tool definitions — maps the 5 card types to agent tool definitions.
 *
 * Each card type's propsSchema (Zod) is manually converted to JSON Schema
 * for inclusion in the agent tool surface. The model calls these tools
 * instead of writing XML card markup.
 *
 * Tool names use `show_` prefix to indicate display-only semantics.
 */
import type { ToolDefinition } from '@nous/shared';

/** Card type descriptor for tool-call-based card delivery. */
export interface CardToolCall {
  type: string
  props: Record<string, unknown>
}

/** Names of card tools for detection during tool handling. */
export const CARD_TOOL_NAMES = [
  'show_status_card',
  'show_action_card',
  'show_approval_card',
  'show_workflow_card',
  'show_followup',
] as const;

export type CardToolName = (typeof CARD_TOOL_NAMES)[number];

/** Map from tool name to card component name. */
export const CARD_TOOL_TO_TYPE: Record<CardToolName, string> = {
  show_status_card: 'StatusCard',
  show_action_card: 'ActionCard',
  show_approval_card: 'ApprovalCard',
  show_workflow_card: 'WorkflowCard',
  show_followup: 'FollowUpBlock',
};

export function isCardToolName(name: string): name is CardToolName {
  return (CARD_TOOL_NAMES as readonly string[]).includes(name);
}

export const CARD_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'show_status_card',
    version: '1.0.0',
    description: 'Display a status card reporting operation progress. Use for long-running operations with optional progress bar.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Status card title' },
        status: { type: 'string', enum: ['active', 'complete', 'error', 'waiting'], description: 'Current status' },
        description: { type: 'string', description: 'Status description' },
        detail: { type: 'string', description: 'Optional detail text' },
        progress: { type: 'number', minimum: 0, maximum: 100, description: 'Progress percentage (0-100)' },
      },
      required: ['title', 'status', 'description'],
    },
    outputSchema: { type: 'object', properties: { rendered: { type: 'boolean' } } },
    capabilities: ['read'],
    permissionScope: 'ui',
  },
  {
    name: 'show_action_card',
    version: '1.0.0',
    description: 'Present action buttons for user choice. Use when offering 2+ distinct actions.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Card title' },
        description: { type: 'string', description: 'Action context description' },
        actions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              actionType: { type: 'string', enum: ['approve', 'reject', 'navigate', 'followup'] },
              payload: { type: 'object' },
              variant: { type: 'string', enum: ['primary', 'secondary', 'ghost'], default: 'secondary' },
            },
            required: ['label', 'actionType'],
          },
        },
      },
      required: ['title', 'description', 'actions'],
    },
    outputSchema: { type: 'object', properties: { rendered: { type: 'boolean' } } },
    capabilities: ['read'],
    permissionScope: 'ui',
  },
  {
    name: 'show_approval_card',
    version: '1.0.0',
    description: 'Request user approval for a governed action. Use for operations requiring explicit consent.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Approval request title' },
        description: { type: 'string', description: 'What is being approved' },
        tier: { type: 'string', enum: ['t1', 't2', 't3'], description: 'Security tier: t1=routine, t2=caution, t3=critical' },
        command: { type: 'string', description: 'The command or action to approve' },
        context: { type: 'object', description: 'Optional context key-value pairs' },
      },
      required: ['title', 'description', 'tier', 'command'],
    },
    outputSchema: { type: 'object', properties: { rendered: { type: 'boolean' } } },
    capabilities: ['read'],
    permissionScope: 'ui',
  },
  {
    name: 'show_workflow_card',
    version: '1.0.0',
    description: 'Display workflow pipeline status and controls.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Workflow title' },
        workflowId: { type: 'string', description: 'Unique workflow identifier' },
        nodeCount: { type: 'number', description: 'Number of nodes in workflow' },
        status: { type: 'string', enum: ['draft', 'ready', 'running', 'completed', 'failed'] },
        description: { type: 'string', description: 'Workflow description' },
      },
      required: ['title', 'workflowId'],
    },
    outputSchema: { type: 'object', properties: { rendered: { type: 'boolean' } } },
    capabilities: ['read'],
    permissionScope: 'ui',
  },
  {
    name: 'show_followup',
    version: '1.0.0',
    description: 'Offer follow-up suggestion pills after completing a task. Use to suggest 2-4 next steps.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Introductory text above suggestions' },
        suggestions: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              prompt: { type: 'string', description: 'Custom prompt text (defaults to label)' },
              actionType: { type: 'string', enum: ['followup', 'navigate', 'submit'], default: 'followup' },
              payload: { type: 'object' },
            },
            required: ['label'],
          },
        },
      },
      required: ['suggestions'],
    },
    outputSchema: { type: 'object', properties: { rendered: { type: 'boolean' } } },
    capabilities: ['read'],
    permissionScope: 'ui',
  },
];
