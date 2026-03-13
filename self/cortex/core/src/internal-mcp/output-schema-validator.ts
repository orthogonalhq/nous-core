import type {
  InternalMcpOutputSchemaValidationResult,
  InternalMcpOutputSchemaValidator,
} from './types.js';

function fail(issue: string): InternalMcpOutputSchemaValidationResult {
  return { success: false, issues: [issue] };
}

export class DefaultSchemaRefValidator
implements InternalMcpOutputSchemaValidator {
  async validate(
    schemaRef: string,
    value: unknown,
  ): Promise<InternalMcpOutputSchemaValidationResult> {
    if (!schemaRef.startsWith('schema://') && schemaRef !== 'n/a') {
      return fail(`Unresolvable schema ref: ${schemaRef}`);
    }

    if (schemaRef === 'n/a') {
      return { success: true };
    }

    if (schemaRef === 'schema://chat-response') {
      if (
        typeof value === 'object' &&
        value != null &&
        'response' in value &&
        typeof (value as { response?: unknown }).response === 'string'
      ) {
        return { success: true };
      }
      return fail('schema://chat-response requires an object with a string response field');
    }

    if (typeof value === 'undefined') {
      return fail(`Schema ${schemaRef} does not allow undefined values`);
    }

    return { success: true };
  }
}

export class PassthroughOutputSchemaValidator
extends DefaultSchemaRefValidator {}
