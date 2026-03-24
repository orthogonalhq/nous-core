/**
 * YAML parser for declarative workflow specifications.
 *
 * Parses a YAML string, validates it through the WorkflowSpec Zod schema,
 * and returns a typed result or structured validation errors.
 */
import YAML from 'yaml';
import {
  type WorkflowSpec,
  type WorkflowSpecValidationError,
  validateWorkflowSpec,
} from '@nous/shared';

export interface ParseWorkflowSpecSuccess {
  success: true;
  data: WorkflowSpec;
}

export interface ParseWorkflowSpecFailure {
  success: false;
  errors: WorkflowSpecValidationError[];
}

export type ParseWorkflowSpecResult =
  | ParseWorkflowSpecSuccess
  | ParseWorkflowSpecFailure;

/**
 * Parse a YAML string into a validated `WorkflowSpec`.
 *
 * Returns structured errors for both YAML syntax errors and schema
 * validation failures.
 */
export function parseWorkflowSpec(yamlString: string): ParseWorkflowSpecResult {
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlString);
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          path: 'root',
          message: `YAML parse error: ${(error as Error).message}`,
        },
      ],
    };
  }

  return validateWorkflowSpec(parsed);
}
