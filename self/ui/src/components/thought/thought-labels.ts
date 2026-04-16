export const LIFECYCLE_PHASE_LABELS: Record<string, string> = {
  'turn-start': 'Turn Started',
  'opctl-check': 'Operations Check',
  'gateway-run': 'Gateway Execution',
  'response-resolved': 'Response Resolved',
  'stm-finalize': 'Memory Finalized',
  'trace-record': 'Trace Recorded',
  'turn-complete': 'Turn Complete',
}

export const PFC_THOUGHT_TYPE_LABELS: Record<string, string> = {
  'confidence-governance': 'Confidence Check',
  'memory-write': 'Memory Write',
  'memory-mutation': 'Memory Update',
  'tool-execution': 'Tool Execution',
  'reflection': 'Reflection',
  'escalation': 'Escalation',
}

export function getThoughtLabel(
  type: 'phase' | 'thoughtType',
  slug: string,
): string {
  const map = type === 'phase' ? LIFECYCLE_PHASE_LABELS : PFC_THOUGHT_TYPE_LABELS
  return map[slug] ?? slug
}
