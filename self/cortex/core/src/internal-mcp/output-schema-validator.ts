import type {
  InternalMcpOutputSchemaValidationResult,
  InternalMcpOutputSchemaValidator,
} from './types.js';

export class PassthroughOutputSchemaValidator
implements InternalMcpOutputSchemaValidator {
  async validate(): Promise<InternalMcpOutputSchemaValidationResult> {
    return { success: true };
  }
}
