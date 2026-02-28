/**
 * Chat control-plane module for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
export { ChatScopeResolver } from './scope-resolver.js';
export { ChatIntentClassifier } from './intent-classifier.js';
export { ChatControlRouter } from './control-router.js';
export { InMemoryChatThreadStore } from './thread-store.js';
export { ChatThreadBindGuard } from './thread-bind-guard.js';
