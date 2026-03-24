import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createEventSseHandler } from '../../sse/event-sse-handler';
import { EventBus } from '../../event-bus/event-bus';

/**
 * Minimal mock for IncomingMessage.
 */
function createMockReq(url: string): IncomingMessage {
  return {
    url,
    headers: { host: 'localhost:3000' },
  } as unknown as IncomingMessage;
}

/**
 * Minimal mock for ServerResponse with event emitter for 'close'.
 */
function createMockRes() {
  const emitter = new EventEmitter();
  const chunks: string[] = [];
  let headersWritten = false;
  let statusCode = 0;
  let headers: Record<string, string> = {};

  const res = {
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      if (hdrs) headers = { ...hdrs };
      headersWritten = true;
    },
    flushHeaders() {
      // no-op
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      emitter.on(event, handler);
    },
    // Test helpers (not part of ServerResponse)
    _chunks: chunks,
    _getStatusCode: () => statusCode,
    _getHeaders: () => headers,
    _isHeadWritten: () => headersWritten,
    _emitClose: () => emitter.emit('close'),
  };

  return res as unknown as ServerResponse & {
    _chunks: string[];
    _getStatusCode: () => number;
    _getHeaders: () => Record<string, string>;
    _isHeadWritten: () => boolean;
    _emitClose: () => void;
  };
}

describe('createEventSseHandler', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    vi.useFakeTimers();
  });

  afterEach(() => {
    bus.dispose();
    vi.useRealTimers();
  });

  // --- Tier 1: Contract Tests ---

  describe('Tier 1 — Contract', () => {
    it('sets SSE headers (Content-Type, Cache-Control, Connection)', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events');
      const res = createMockRes();

      handler(req, res);

      expect(res._isHeadWritten()).toBe(true);
      expect(res._getStatusCode()).toBe(200);
      const headers = res._getHeaders();
      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(headers['Cache-Control']).toBe('no-cache');
      expect(headers['Connection']).toBe('keep-alive');
    });

    it('writes events as SSE frames with event: and data: fields', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events?channels=health:boot-step');
      const res = createMockRes();

      handler(req, res);

      bus.publish('health:boot-step', { step: 'db-init', status: 'completed' });

      expect(res._chunks.length).toBeGreaterThan(0);
      const frame = res._chunks.join('');
      expect(frame).toContain('event: health:boot-step');
      expect(frame).toContain('data: {"step":"db-init","status":"completed"}');
    });

    it('sends heartbeat comments on interval', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events');
      const res = createMockRes();

      handler(req, res);

      // Advance past one heartbeat interval (30s)
      vi.advanceTimersByTime(30_000);

      const allOutput = res._chunks.join('');
      expect(allOutput).toContain(': heartbeat\n\n');
    });
  });

  // --- Tier 2: Behavior Tests ---

  describe('Tier 2 — Behavior', () => {
    it('filters events by ?channels= query parameter', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events?channels=health:boot-step');
      const res = createMockRes();

      handler(req, res);

      // Publish to subscribed channel
      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      // Publish to non-subscribed channel
      bus.publish('mao:projection-changed', {});

      const allOutput = res._chunks.join('');
      expect(allOutput).toContain('event: health:boot-step');
      expect(allOutput).not.toContain('event: mao:projection-changed');
    });

    it('supports glob prefix filtering (health:*)', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events?channels=health:*');
      const res = createMockRes();

      handler(req, res);

      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      bus.publish('health:gateway-status', { status: 'booted' });
      bus.publish('mao:projection-changed', {});

      const allOutput = res._chunks.join('');
      expect(allOutput).toContain('event: health:boot-step');
      expect(allOutput).toContain('event: health:gateway-status');
      expect(allOutput).not.toContain('event: mao:projection-changed');
    });

    it('subscribes to all channels when no ?channels= is specified', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events');
      const res = createMockRes();

      handler(req, res);

      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      bus.publish('mao:projection-changed', {});
      bus.publish('escalation:new', {
        escalationId: 'e1',
        severity: 'high',
        message: 'test',
      });

      const allOutput = res._chunks.join('');
      expect(allOutput).toContain('event: health:boot-step');
      expect(allOutput).toContain('event: mao:projection-changed');
      expect(allOutput).toContain('event: escalation:new');
    });

    it('cleans up subscriptions on res close', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events?channels=health:boot-step');
      const res = createMockRes();

      handler(req, res);

      // Verify subscription is active
      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      expect(res._chunks.length).toBeGreaterThan(0);

      // Clear chunks
      res._chunks.length = 0;

      // Simulate connection close
      res._emitClose();

      // Publish after close — should not be received
      bus.publish('health:boot-step', { step: 'y', status: 'completed' });
      expect(res._chunks.length).toBe(0);
    });

    it('clears heartbeat interval on res close', () => {
      const handler = createEventSseHandler(bus);
      const req = createMockReq('/events');
      const res = createMockRes();

      handler(req, res);

      // Simulate connection close
      res._emitClose();

      // Clear chunks
      res._chunks.length = 0;

      // Advance timers — heartbeat should not fire
      vi.advanceTimersByTime(60_000);
      expect(res._chunks.length).toBe(0);
    });
  });
});
