import { z } from 'zod';
import { AppPackageManifestSchema } from './app-manifest.js';
import {
  ChannelEgressEnvelopeSchema,
  ChannelIngressEnvelopeSchema,
} from './communication-gateway.js';
import { ProjectIdSchema } from './ids.js';
import { SandboxPayloadSchema } from './sandbox.js';

export const AppCompiledPermissionFlagsSchema = z.object({
  allow_read: z.array(z.string().min(1)).default([]),
  allow_write: z.array(z.string().min(1)).default([]),
  allow_net: z.array(z.string().min(1)).default([]),
  deny_env: z.literal(true).default(true),
  deny_run: z.literal(true).default(true),
  deny_ffi: z.literal(true).default(true),
  cached_only: z.boolean().default(true),
});
export type AppCompiledPermissionFlags = z.infer<
  typeof AppCompiledPermissionFlagsSchema
>;

export const AppLaunchSpecSchema = z.object({
  app_id: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  project_id: ProjectIdSchema.optional(),
  manifest_version: z.string().min(1).default('1'),
  entrypoint: z.string().min(1),
  working_directory: z.string().min(1),
  deno_args: z.array(z.string().min(1)).min(1),
  compiled_permissions: AppCompiledPermissionFlagsSchema,
  lockfile_path: z.string().min(1).optional(),
  app_data_dir: z.string().min(1),
  config_version: z.string().min(1),
  manifest_ref: z.string().min(1).optional(),
});
export type AppLaunchSpec = z.infer<typeof AppLaunchSpecSchema>;

export const AppHandshakeConfigSourceSchema = z.enum([
  'manifest_default',
  'project_config',
  'system',
]);
export type AppHandshakeConfigSource = z.infer<
  typeof AppHandshakeConfigSourceSchema
>;

export const AppHandshakeConfigEntrySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  source: AppHandshakeConfigSourceSchema,
  mutable: z.literal(false).default(false),
});
export type AppHandshakeConfigEntry = z.infer<
  typeof AppHandshakeConfigEntrySchema
>;

export const AppHealthStatusSchema = z.enum([
  'healthy',
  'degraded',
  'unhealthy',
  'stale',
]);
export type AppHealthStatus = z.infer<typeof AppHealthStatusSchema>;

export const AppRuntimeStatusSchema = z.enum([
  'starting',
  'active',
  'draining',
  'stopped',
  'failed',
]);
export type AppRuntimeStatus = z.infer<typeof AppRuntimeStatusSchema>;

export const AppPanelRegistrationProjectionSchema = z.object({
  app_id: z.string().min(1),
  session_id: z.string().min(1),
  panel_id: z.string().min(1),
  label: z.string().min(1),
  entry: z.string().min(1),
  position: z.enum(['left', 'right', 'bottom', 'main']).optional(),
  preserve_state: z.boolean().default(true),
});
export type AppPanelRegistrationProjection = z.infer<
  typeof AppPanelRegistrationProjectionSchema
>;

export const AppActivationHandshakeSchema = z.object({
  session_id: z.string().min(1),
  app_id: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  allowed_outbound_tools: z.array(z.string().min(1)).default([]),
  config: z.array(AppHandshakeConfigEntrySchema).default([]),
  permissions: AppCompiledPermissionFlagsSchema,
  panels: z.array(AppPanelRegistrationProjectionSchema).default([]),
  heartbeat_interval_ms: z.number().int().positive().default(30_000),
});
export type AppActivationHandshake = z.infer<
  typeof AppActivationHandshakeSchema
>;

export const AppRuntimeSessionSchema = z.object({
  session_id: z.string().min(1),
  app_id: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  project_id: ProjectIdSchema.optional(),
  pid: z.number().int().positive(),
  status: AppRuntimeStatusSchema,
  started_at: z.string().datetime(),
  stopped_at: z.string().datetime().optional(),
  registered_tool_ids: z.array(z.string().min(1)).default([]),
  panel_ids: z.array(z.string().min(1)).default([]),
  health_status: AppHealthStatusSchema.default('healthy'),
  last_heartbeat_at: z.string().datetime().optional(),
  config_version: z.string().min(1),
});
export type AppRuntimeSession = z.infer<typeof AppRuntimeSessionSchema>;

export const AppOutboundToolCallContextSchema = z.object({
  caller_type: z.literal('app'),
  app_id: z.string().min(1),
  package_id: z.string().min(1),
  session_id: z.string().min(1),
  project_id: ProjectIdSchema.optional(),
  tool_id: z.string().min(1),
  request_id: z.string().min(1),
});
export type AppOutboundToolCallContext = z.infer<
  typeof AppOutboundToolCallContextSchema
>;

export const AppToolRegistrationRecordSchema = z.object({
  app_id: z.string().min(1),
  session_id: z.string().min(1),
  tool_name: z.string().min(1),
  namespaced_tool_id: z.string().min(1),
  description: z.string().min(1),
  input_schema: z.record(z.unknown()),
  output_schema: z.record(z.unknown()).optional(),
  registration_witness_ref: z.string().min(1).optional(),
});
export type AppToolRegistrationRecord = z.infer<
  typeof AppToolRegistrationRecordSchema
>;

export const AppHealthSnapshotSchema = z.object({
  session_id: z.string().min(1),
  status: AppHealthStatusSchema,
  reported_at: z.string().datetime(),
  latency_ms: z.number().min(0).optional(),
  details: z.record(z.unknown()).default({}),
  stale: z.boolean().default(false),
});
export type AppHealthSnapshot = z.infer<typeof AppHealthSnapshotSchema>;

export const AppHeartbeatSignalSchema = z.object({
  session_id: z.string().min(1),
  reported_at: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
  status_hint: AppHealthStatusSchema.optional(),
});
export type AppHeartbeatSignal = z.infer<typeof AppHeartbeatSignalSchema>;

export const AppConnectorModeSchema = z.enum([
  'connector',
  'full_client',
]);
export type AppConnectorMode = z.infer<typeof AppConnectorModeSchema>;

export const AppConnectorIngressIntentSourceSchema = z.enum([
  'telegram_app_tool',
  'telegram_poller',
]);
export type AppConnectorIngressIntentSource = z.infer<
  typeof AppConnectorIngressIntentSourceSchema
>;

export const AppConnectorIngressIntentSchema = z.object({
  session_id: z.string().min(1),
  connector_id: z.string().min(1),
  envelope: ChannelIngressEnvelopeSchema,
  source: AppConnectorIngressIntentSourceSchema,
});
export type AppConnectorIngressIntent = z.infer<
  typeof AppConnectorIngressIntentSchema
>;

export const AppConnectorEgressIntentSchema = z.object({
  session_id: z.string().min(1),
  connector_id: z.string().min(1),
  envelope: ChannelEgressEnvelopeSchema,
  requested_by_tool: z.string().min(1),
});
export type AppConnectorEgressIntent = z.infer<
  typeof AppConnectorEgressIntentSchema
>;

export const AppConnectorSessionReportSchema = z.object({
  session_id: z.string().min(1),
  connector_id: z.string().min(1),
  mode: AppConnectorModeSchema,
  health: AppHealthStatusSchema,
  metadata: z.record(z.unknown()).default({}),
  reported_at: z.string().datetime(),
});
export type AppConnectorSessionReport = z.infer<
  typeof AppConnectorSessionReportSchema
>;

export const AppRuntimeActivationInputSchema = z.object({
  project_id: ProjectIdSchema.optional(),
  package_root_ref: z.string().min(1),
  manifest_ref: z.string().min(1),
  manifest: AppPackageManifestSchema,
  launch_spec: AppLaunchSpecSchema,
  config: z.array(AppHandshakeConfigEntrySchema).default([]),
  allowed_outbound_tools: z.array(z.string().min(1)).default([]),
  panels: z.array(AppPanelRegistrationProjectionSchema).default([]),
  sandbox_payload: SandboxPayloadSchema.optional(),
});
export type AppRuntimeActivationInput = z.infer<
  typeof AppRuntimeActivationInputSchema
>;

export const AppRuntimeDeactivationInputSchema = z.object({
  session_id: z.string().min(1),
  reason: z.string().min(1),
  disable_package: z.boolean().default(false),
});
export type AppRuntimeDeactivationInput = z.infer<
  typeof AppRuntimeDeactivationInputSchema
>;

export const AppProcessExitEventSchema = z.object({
  session_id: z.string().min(1),
  code: z.number().int().optional(),
  signal: z.string().min(1).optional(),
  occurred_at: z.string().datetime(),
  reason: z.string().min(1).optional(),
});
export type AppProcessExitEvent = z.infer<typeof AppProcessExitEventSchema>;
