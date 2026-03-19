import { z } from 'zod';
import {
  AppHandshakeConfigSourceSchema,
  AppPanelLifecycleEventSchema,
  AppPanelLifecycleReasonSchema,
} from './app-runtime.js';

export const PANEL_BRIDGE_PROTOCOL_VERSION = 1 as const;
export const PANEL_BRIDGE_SUPPORTED_PROTOCOL_VERSIONS = [
  PANEL_BRIDGE_PROTOCOL_VERSION,
] as const;

export const PanelBridgeProtocolVersionSchema = z.literal(
  PANEL_BRIDGE_PROTOCOL_VERSION,
);
export type PanelBridgeProtocolVersion = z.infer<
  typeof PanelBridgeProtocolVersionSchema
>;

export const PanelBridgeRequestIdSchema = z.string().min(1);
export type PanelBridgeRequestId = z.infer<typeof PanelBridgeRequestIdSchema>;

export const PanelBridgeMessageKindSchema = z.enum([
  'panel.ready',
  'tool.invoke',
  'config.get',
  'theme.get',
  'notify.send',
  'persisted_state.get',
  'persisted_state.set',
  'persisted_state.delete',
  'host.bootstrap',
  'tool.result',
  'config.result',
  'theme.result',
  'notify.result',
  'persisted_state.result',
  'panel.lifecycle',
  'theme.changed',
  'error',
]);
export type PanelBridgeMessageKind = z.infer<
  typeof PanelBridgeMessageKindSchema
>;

export const PanelBridgeErrorCodeSchema = z.enum([
  'protocol_unsupported',
  'message_invalid',
  'unexpected_source',
  'tool_execution_failed',
  'request_timeout',
  'config_unavailable',
  'notify_unavailable',
  'host_unavailable',
  'internal_error',
]);
export type PanelBridgeErrorCode = z.infer<typeof PanelBridgeErrorCodeSchema>;

export const PanelBridgeErrorSchema = z.object({
  code: PanelBridgeErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.record(z.unknown()).optional(),
});
export type PanelBridgeError = z.infer<typeof PanelBridgeErrorSchema>;

export const PanelBridgeConfigEntrySchema = z.object({
  value: z.unknown(),
  source: AppHandshakeConfigSourceSchema,
});
export type PanelBridgeConfigEntry = z.infer<typeof PanelBridgeConfigEntrySchema>;

export const PanelBridgeConfigSnapshotSchema = z.record(
  z.string().min(1),
  PanelBridgeConfigEntrySchema,
);
export type PanelBridgeConfigSnapshot = z.infer<
  typeof PanelBridgeConfigSnapshotSchema
>;

export const PanelBridgeThemeModeSchema = z.enum(['light', 'dark']);
export type PanelBridgeThemeMode = z.infer<typeof PanelBridgeThemeModeSchema>;

export const PanelBridgeThemeSnapshotSchema = z.object({
  mode: PanelBridgeThemeModeSchema,
  tokens: z.record(z.string().min(1), z.string()),
  metadata: z.record(z.unknown()).default({}),
});
export type PanelBridgeThemeSnapshot = z.infer<
  typeof PanelBridgeThemeSnapshotSchema
>;

export const PanelBridgeNotificationLevelSchema = z.enum([
  'info',
  'success',
  'warning',
  'error',
]);
export type PanelBridgeNotificationLevel = z.infer<
  typeof PanelBridgeNotificationLevelSchema
>;

export const PanelBridgeNotificationSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  level: PanelBridgeNotificationLevelSchema.default('info'),
  context: z.record(z.unknown()).optional(),
});
export type PanelBridgeNotification = z.infer<
  typeof PanelBridgeNotificationSchema
>;

export const PanelBridgeCapabilitiesSchema = z.object({
  tool: z.boolean().default(true),
  config: z.boolean().default(true),
  theme: z.boolean().default(true),
  notify: z.boolean().default(true),
  persisted_state: z.boolean().default(true),
  lifecycle: z.boolean().default(true),
});
export type PanelBridgeCapabilities = z.infer<
  typeof PanelBridgeCapabilitiesSchema
>;

const PanelBridgeEnvelopeSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
});

export const PanelBridgeWindowBootstrapSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
  app_id: z.string().min(1),
  panel_id: z.string().min(1),
  mcp_endpoint: z.string().url(),
});
export type PanelBridgeWindowBootstrap = z.infer<
  typeof PanelBridgeWindowBootstrapSchema
>;

export const PanelReadyMessageSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('panel.ready'),
  message_id: PanelBridgeRequestIdSchema,
  app_id: z.string().min(1),
  panel_id: z.string().min(1),
});
export type PanelReadyMessage = z.infer<typeof PanelReadyMessageSchema>;

export const PanelToolInvokeRequestSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('tool.invoke'),
  request_id: PanelBridgeRequestIdSchema,
  app_id: z.string().min(1),
  panel_id: z.string().min(1),
  tool_name: z.string().min(1),
  params: z.unknown().optional(),
});
export type PanelToolInvokeRequest = z.infer<
  typeof PanelToolInvokeRequestSchema
>;

export const PanelConfigGetRequestSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('config.get'),
  request_id: PanelBridgeRequestIdSchema,
});
export type PanelConfigGetRequest = z.infer<typeof PanelConfigGetRequestSchema>;

export const PanelThemeGetRequestSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('theme.get'),
  request_id: PanelBridgeRequestIdSchema,
});
export type PanelThemeGetRequest = z.infer<typeof PanelThemeGetRequestSchema>;

export const PanelNotifyRequestSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('notify.send'),
  request_id: PanelBridgeRequestIdSchema,
  notification: PanelBridgeNotificationSchema,
});
export type PanelNotifyRequest = z.infer<typeof PanelNotifyRequestSchema>;

export const PanelPersistedStateGetRequestSchema =
  PanelBridgeEnvelopeSchema.extend({
    kind: z.literal('persisted_state.get'),
    request_id: PanelBridgeRequestIdSchema,
    key: z.string().min(1),
  });
export type PanelPersistedStateGetRequest = z.infer<
  typeof PanelPersistedStateGetRequestSchema
>;

export const PanelPersistedStateSetRequestSchema =
  PanelBridgeEnvelopeSchema.extend({
    kind: z.literal('persisted_state.set'),
    request_id: PanelBridgeRequestIdSchema,
    key: z.string().min(1),
    value: z.unknown(),
  });
export type PanelPersistedStateSetRequest = z.infer<
  typeof PanelPersistedStateSetRequestSchema
>;

export const PanelPersistedStateDeleteRequestSchema =
  PanelBridgeEnvelopeSchema.extend({
    kind: z.literal('persisted_state.delete'),
    request_id: PanelBridgeRequestIdSchema,
    key: z.string().min(1),
  });
export type PanelPersistedStateDeleteRequest = z.infer<
  typeof PanelPersistedStateDeleteRequestSchema
>;

export const PanelBridgePanelMessageSchema = z.discriminatedUnion('kind', [
  PanelReadyMessageSchema,
  PanelToolInvokeRequestSchema,
  PanelConfigGetRequestSchema,
  PanelThemeGetRequestSchema,
  PanelNotifyRequestSchema,
  PanelPersistedStateGetRequestSchema,
  PanelPersistedStateSetRequestSchema,
  PanelPersistedStateDeleteRequestSchema,
]);
export type PanelBridgePanelMessage = z.infer<
  typeof PanelBridgePanelMessageSchema
>;

export const HostBootstrapMessageSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('host.bootstrap'),
  message_id: PanelBridgeRequestIdSchema,
  config: PanelBridgeConfigSnapshotSchema,
  theme: PanelBridgeThemeSnapshotSchema,
  capabilities: PanelBridgeCapabilitiesSchema,
});
export type HostBootstrapMessage = z.infer<typeof HostBootstrapMessageSchema>;

export const PanelToolSuccessResponseSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('tool.result'),
  request_id: PanelBridgeRequestIdSchema,
  result: z.unknown(),
});
export type PanelToolSuccessResponse = z.infer<
  typeof PanelToolSuccessResponseSchema
>;

export const PanelConfigResponseSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('config.result'),
  request_id: PanelBridgeRequestIdSchema,
  config: PanelBridgeConfigSnapshotSchema,
});
export type PanelConfigResponse = z.infer<typeof PanelConfigResponseSchema>;

export const PanelThemeResponseSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('theme.result'),
  request_id: PanelBridgeRequestIdSchema,
  theme: PanelBridgeThemeSnapshotSchema,
});
export type PanelThemeResponse = z.infer<typeof PanelThemeResponseSchema>;

export const PanelNotifyResponseSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('notify.result'),
  request_id: PanelBridgeRequestIdSchema,
  accepted: z.boolean(),
});
export type PanelNotifyResponse = z.infer<typeof PanelNotifyResponseSchema>;

export const PanelPersistedStateResponseSchema =
  PanelBridgeEnvelopeSchema.extend({
    kind: z.literal('persisted_state.result'),
    request_id: PanelBridgeRequestIdSchema,
    key: z.string().min(1),
    exists: z.boolean(),
    value: z.unknown().optional(),
  });
export type PanelPersistedStateResponse = z.infer<
  typeof PanelPersistedStateResponseSchema
>;

export const PanelLifecycleChangedMessageSchema =
  PanelBridgeEnvelopeSchema.extend({
    kind: z.literal('panel.lifecycle'),
    event: AppPanelLifecycleEventSchema,
    reason: AppPanelLifecycleReasonSchema,
  });
export type PanelLifecycleChangedMessage = z.infer<
  typeof PanelLifecycleChangedMessageSchema
>;

export const PanelThemeChangedMessageSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('theme.changed'),
  theme: PanelBridgeThemeSnapshotSchema,
});
export type PanelThemeChangedMessage = z.infer<
  typeof PanelThemeChangedMessageSchema
>;

export const PanelBridgeErrorResponseSchema = PanelBridgeEnvelopeSchema.extend({
  kind: z.literal('error'),
  request_id: PanelBridgeRequestIdSchema.optional(),
  error: PanelBridgeErrorSchema,
});
export type PanelBridgeErrorResponse = z.infer<
  typeof PanelBridgeErrorResponseSchema
>;

export const PanelBridgeHostMessageSchema = z.discriminatedUnion('kind', [
  HostBootstrapMessageSchema,
  PanelToolSuccessResponseSchema,
  PanelConfigResponseSchema,
  PanelThemeResponseSchema,
  PanelNotifyResponseSchema,
  PanelPersistedStateResponseSchema,
  PanelLifecycleChangedMessageSchema,
  PanelThemeChangedMessageSchema,
  PanelBridgeErrorResponseSchema,
]);
export type PanelBridgeHostMessage = z.infer<
  typeof PanelBridgeHostMessageSchema
>;

export const PanelBridgeMessageSchema = z.discriminatedUnion('kind', [
  PanelReadyMessageSchema,
  PanelToolInvokeRequestSchema,
  PanelConfigGetRequestSchema,
  PanelThemeGetRequestSchema,
  PanelNotifyRequestSchema,
  PanelPersistedStateGetRequestSchema,
  PanelPersistedStateSetRequestSchema,
  PanelPersistedStateDeleteRequestSchema,
  HostBootstrapMessageSchema,
  PanelToolSuccessResponseSchema,
  PanelConfigResponseSchema,
  PanelThemeResponseSchema,
  PanelNotifyResponseSchema,
  PanelPersistedStateResponseSchema,
  PanelLifecycleChangedMessageSchema,
  PanelThemeChangedMessageSchema,
  PanelBridgeErrorResponseSchema,
]);
export type PanelBridgeMessage = z.infer<typeof PanelBridgeMessageSchema>;

export const PanelBridgeToolTransportRequestSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
  request_id: PanelBridgeRequestIdSchema,
  app_id: z.string().min(1),
  panel_id: z.string().min(1),
  tool_name: z.string().min(1),
  params: z.unknown().optional(),
});
export type PanelBridgeToolTransportRequest = z.infer<
  typeof PanelBridgeToolTransportRequestSchema
>;

export const PanelBridgeToolTransportSuccessSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
  request_id: PanelBridgeRequestIdSchema,
  ok: z.literal(true),
  result: z.unknown(),
});
export type PanelBridgeToolTransportSuccess = z.infer<
  typeof PanelBridgeToolTransportSuccessSchema
>;

export const PanelBridgeToolTransportFailureSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
  request_id: PanelBridgeRequestIdSchema,
  ok: z.literal(false),
  error: PanelBridgeErrorSchema,
});
export type PanelBridgeToolTransportFailure = z.infer<
  typeof PanelBridgeToolTransportFailureSchema
>;

export const PanelBridgeToolTransportResponseSchema = z.union([
  PanelBridgeToolTransportSuccessSchema,
  PanelBridgeToolTransportFailureSchema,
]);
export type PanelBridgeToolTransportResponse = z.infer<
  typeof PanelBridgeToolTransportResponseSchema
>;

export const PanelPersistedStateTransportGetRequestSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
  request_id: PanelBridgeRequestIdSchema,
  app_id: z.string().min(1),
  panel_id: z.string().min(1),
  key: z.string().min(1),
});
export type PanelPersistedStateTransportGetRequest = z.infer<
  typeof PanelPersistedStateTransportGetRequestSchema
>;

export const PanelPersistedStateTransportSetRequestSchema =
  PanelPersistedStateTransportGetRequestSchema.extend({
    value: z.unknown(),
  });
export type PanelPersistedStateTransportSetRequest = z.infer<
  typeof PanelPersistedStateTransportSetRequestSchema
>;

export const PanelPersistedStateTransportDeleteRequestSchema =
  PanelPersistedStateTransportGetRequestSchema;
export type PanelPersistedStateTransportDeleteRequest = z.infer<
  typeof PanelPersistedStateTransportDeleteRequestSchema
>;

export const PanelPersistedStateTransportResultSchema = z.object({
  protocol: PanelBridgeProtocolVersionSchema,
  request_id: PanelBridgeRequestIdSchema,
  ok: z.literal(true),
  key: z.string().min(1),
  exists: z.boolean(),
  value: z.unknown().optional(),
});
export type PanelPersistedStateTransportResult = z.infer<
  typeof PanelPersistedStateTransportResultSchema
>;
