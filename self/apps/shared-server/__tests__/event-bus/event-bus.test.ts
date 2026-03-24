import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/event-bus/event-bus';

describe('EventBus', () => {
  // --- Tier 1: Contract Tests ---

  describe('Tier 1 — Contract', () => {
    it('publish() delivers payload to all channel subscribers', () => {
      const bus = new EventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('health:boot-step', handler1);
      bus.subscribe('health:boot-step', handler2);

      const payload = { step: 'db-init', status: 'completed' as const };
      bus.publish('health:boot-step', payload);

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    it('subscribe() returns a unique subscription ID', () => {
      const bus = new EventBus();
      const id1 = bus.subscribe('health:boot-step', () => {});
      const id2 = bus.subscribe('health:boot-step', () => {});

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('unsubscribe() stops delivery to the removed handler', () => {
      const bus = new EventBus();
      const handler = vi.fn();

      const id = bus.subscribe('health:boot-step', handler);
      bus.unsubscribe(id);

      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('dispose() removes all subscriptions', () => {
      const bus = new EventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('health:boot-step', handler1);
      bus.subscribe('mao:projection-changed', handler2);

      bus.dispose();

      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      bus.publish('mao:projection-changed', {});
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('publish() after dispose() is a silent no-op', () => {
      const bus = new EventBus();
      const handler = vi.fn();

      bus.subscribe('health:boot-step', handler);
      bus.dispose();

      // Should not throw
      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // --- Tier 2: Behavior Tests ---

  describe('Tier 2 — Behavior', () => {
    it('publish() on channel A does not trigger channel B subscribers', () => {
      const bus = new EventBus();
      const healthHandler = vi.fn();
      const maoHandler = vi.fn();

      bus.subscribe('health:boot-step', healthHandler);
      bus.subscribe('mao:projection-changed', maoHandler);

      bus.publish('health:boot-step', { step: 'db-init', status: 'completed' });
      expect(healthHandler).toHaveBeenCalledOnce();
      expect(maoHandler).not.toHaveBeenCalled();
    });

    it('multiple subscribers on same channel all receive the event', () => {
      const bus = new EventBus();
      const handlers = [vi.fn(), vi.fn(), vi.fn()];
      for (const h of handlers) {
        bus.subscribe('escalation:new', h);
      }

      const payload = {
        escalationId: 'e1',
        severity: 'high' as const,
        message: 'test',
      };
      bus.publish('escalation:new', payload);

      for (const h of handlers) {
        expect(h).toHaveBeenCalledOnce();
        expect(h).toHaveBeenCalledWith(payload);
      }
    });

    it('unsubscribe() with unknown ID is a no-op (no error)', () => {
      const bus = new EventBus();
      expect(() => bus.unsubscribe('nonexistent-id')).not.toThrow();
    });
  });

  // --- Tier 3: Edge Case Tests ---

  describe('Tier 3 — Edge Cases', () => {
    it('a throwing handler does not prevent other handlers from receiving the event', () => {
      const bus = new EventBus();
      const handler1 = vi.fn();
      const throwingHandler = vi.fn(() => {
        throw new Error('handler failure');
      });
      const handler3 = vi.fn();

      bus.subscribe('health:boot-step', handler1);
      bus.subscribe('health:boot-step', throwingHandler);
      bus.subscribe('health:boot-step', handler3);

      const payload = { step: 'x', status: 'started' as const };
      bus.publish('health:boot-step', payload);

      expect(handler1).toHaveBeenCalledOnce();
      expect(throwingHandler).toHaveBeenCalledOnce();
      expect(handler3).toHaveBeenCalledOnce();
    });

    it('a throwing handler error is logged (not swallowed silently)', () => {
      const bus = new EventBus();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bus.subscribe('health:boot-step', () => {
        throw new Error('test error');
      });

      bus.publish('health:boot-step', { step: 'x', status: 'started' });

      expect(consoleSpy).toHaveBeenCalledOnce();
      expect(consoleSpy.mock.calls[0]![0]).toContain('[nous:event-bus] handler-error');
      expect(consoleSpy.mock.calls[0]![0]).toContain('health:boot-step');
      expect(consoleSpy.mock.calls[0]![0]).toContain('test error');

      consoleSpy.mockRestore();
    });

    it('subscribe() after dispose() returns empty string and does not register', () => {
      const bus = new EventBus();
      bus.dispose();

      const handler = vi.fn();
      const id = bus.subscribe('health:boot-step', handler);
      expect(id).toBe('');

      bus.publish('health:boot-step', { step: 'x', status: 'started' });
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
