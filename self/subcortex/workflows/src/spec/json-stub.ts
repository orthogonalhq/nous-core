/**
 * JSON stub serialization for declarative workflow specifications.
 *
 * Provides JSON.parse / JSON.stringify wrappers that validate through the
 * same Zod schema as the YAML path. JSON is a stub format — same schema,
 * different serialization.
 */
import {
  type WorkflowSpec,
  type WorkflowSpecValidationError,
  validateWorkflowSpec,
} from '@nous/shared';

export interface ParseJsonWorkflowSpecSuccess {
  success: true;
  data: WorkflowSpec;
}

export interface ParseJsonWorkflowSpecFailure {
  success: false;
  errors: WorkflowSpecValidationError[];
}

export type ParseJsonWorkflowSpecResult =
  | ParseJsonWorkflowSpecSuccess
  | ParseJsonWorkflowSpecFailure;

/**
 * Parse a JSON string into a validated `WorkflowSpec`.
 */
export function parseJsonWorkflowSpec(
  jsonString: string,
): ParseJsonWorkflowSpecResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          path: 'root',
          message: `JSON parse error: ${(error as Error).message}`,
        },
      ],
    };
  }

  return validateWorkflowSpec(parsed);
}

/**
 * Serialize a `WorkflowSpec` to a JSON string.
 */
export function serializeJsonWorkflowSpec(
  spec: WorkflowSpec,
  indent?: number,
): string {
  return JSON.stringify(spec, null, indent ?? 2);
}
