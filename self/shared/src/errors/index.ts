/**
 * Domain error classes for Nous-OSS.
 */
export { NousError } from './base.js';

import { NousError } from './base.js';

export class PfcDeniedError extends NousError {
  constructor(
    action: string,
    reason: string,
    context?: Record<string, unknown>,
  ) {
    super(`PFC denied: ${action} — ${reason}`, 'PFC_DENIED', context);
    this.name = 'PfcDeniedError';
  }
}

export class MemoryAccessDeniedError extends NousError {
  constructor(
    projectId: string,
    targetProjectId: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `Memory access denied: ${projectId} cannot access ${targetProjectId}`,
      'MEMORY_ACCESS_DENIED',
      context,
    );
    this.name = 'MemoryAccessDeniedError';
  }
}

export class ProviderError extends NousError {
  constructor(
    providerId: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(`Provider ${providerId}: ${message}`, 'PROVIDER_ERROR', context);
    this.name = 'ProviderError';
  }
}

export class ToolExecutionError extends NousError {
  constructor(
    toolName: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(`Tool ${toolName}: ${message}`, 'TOOL_EXECUTION_ERROR', context);
    this.name = 'ToolExecutionError';
  }
}

export class ConfigError extends NousError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

export class ValidationError extends NousError {
  constructor(
    message: string,
    errors: Array<{ path: string; message: string }>,
  ) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
  }
}
