/**
 * Sandbox domain types for Nous-OSS.
 *
 * Supports the ISandbox interface.
 */
import { z } from 'zod';

// --- Sandbox Payload ---
// Code to execute in the sandbox.
export const SandboxPayloadSchema = z.object({
  source: z.string(),
  capabilities: z.array(z.string()),
  timeoutMs: z.number().positive().optional(),
  memoryLimitMb: z.number().positive().optional(),
});
export type SandboxPayload = z.infer<typeof SandboxPayloadSchema>;

// --- Sandbox Result ---
// Result of sandbox execution.
export const SandboxResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown(),
  error: z.string().optional(),
  resourceUsage: z.object({
    durationMs: z.number().min(0),
    memoryMb: z.number().min(0),
  }),
});
export type SandboxResult = z.infer<typeof SandboxResultSchema>;
