/**
 * Event bus types, interfaces, and Zod payload schemas.
 *
 * No execution logic — the EventBus implementation lives in @nous/web
 * server-side code. This module provides only the type contracts and
 * validation schemas.
 */
export * from './types.js';
export type { IEventBus, IReadEventBus } from './interface.js';
