/**
 * Base error class for Nous-OSS.
 *
 * All Nous errors extend this class. Provides structured error codes
 * and optional context metadata for consistent handling across layers.
 */
export class NousError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'NousError';
    this.code = code;
    this.context = context;
  }
}
