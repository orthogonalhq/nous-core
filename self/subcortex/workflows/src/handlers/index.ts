import type {
  IModelRouter,
  IToolExecutor,
  IWorkflowNodeHandler,
  WorkflowNodeKind,
} from '@nous/shared';
import { ConditionWorkflowNodeHandler } from './condition-handler.js';
import { HumanDecisionWorkflowNodeHandler } from './human-decision-handler.js';
import { ModelCallWorkflowNodeHandler } from './model-call-handler.js';
import { QualityGateWorkflowNodeHandler } from './quality-gate-handler.js';
import { ToolExecutionWorkflowNodeHandler } from './tool-execution-handler.js';
import { TransformWorkflowNodeHandler } from './transform-handler.js';

export interface WorkflowNodeHandlerDependencies {
  modelRouter?: IModelRouter;
  toolExecutor?: IToolExecutor;
}

export function createWorkflowNodeHandlerRegistry(
  deps: WorkflowNodeHandlerDependencies = {},
): Map<WorkflowNodeKind, IWorkflowNodeHandler> {
  return new Map<WorkflowNodeKind, IWorkflowNodeHandler>([
    ['model-call', new ModelCallWorkflowNodeHandler(deps.modelRouter)],
    ['tool-execution', new ToolExecutionWorkflowNodeHandler(deps.toolExecutor)],
    ['condition', new ConditionWorkflowNodeHandler()],
    ['transform', new TransformWorkflowNodeHandler()],
    ['quality-gate', new QualityGateWorkflowNodeHandler()],
    ['human-decision', new HumanDecisionWorkflowNodeHandler()],
  ]);
}
