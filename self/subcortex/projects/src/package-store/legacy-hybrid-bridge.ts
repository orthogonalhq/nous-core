import {
  LegacyWorkflowRefsSchema,
  type LegacyWorkflowRefs,
} from '@nous/shared';

export interface LegacyHybridBridgeInput {
  flowRef?: string;
  stepRefs?: readonly string[];
}

export const createLegacyHybridBridgeView = (
  input: LegacyHybridBridgeInput,
): LegacyWorkflowRefs | undefined => {
  const stepRefs = [...(input.stepRefs ?? [])];
  if (!input.flowRef && stepRefs.length === 0) {
    return undefined;
  }

  return LegacyWorkflowRefsSchema.parse({
    flowRef: input.flowRef,
    stepRefs,
  });
};

export const hasLegacyHybridBridgeView = (
  input: LegacyHybridBridgeInput,
): boolean => createLegacyHybridBridgeView(input) != null;
