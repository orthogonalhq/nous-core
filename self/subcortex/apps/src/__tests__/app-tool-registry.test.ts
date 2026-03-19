import { describe, expect, it, vi } from 'vitest';
import { AppToolRegistry } from '../app-tool-registry.js';

describe('AppToolRegistry', () => {
  it('registers and deregisters namespaced app tools', async () => {
    const registrar = {
      register: vi.fn().mockResolvedValue({ witnessRef: 'evt-1' }),
      unregister: vi.fn().mockResolvedValue(undefined),
    };
    const registry = new AppToolRegistry(registrar);

    const records = await registry.registerSessionTools({
      appId: 'app:weather',
      sessionId: 'session-1',
      definitions: [
        {
          tool_name: 'get_forecast',
          description: 'Fetch weather',
          input_schema: {},
        },
      ],
    });

    expect(records[0]?.namespaced_tool_id).toBe('app:weather.get_forecast');
    expect(registrar.register).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: 'app:weather.get_forecast',
        sessionId: 'session-1',
        appId: 'app:weather',
        definition: expect.objectContaining({ tool_name: 'get_forecast' }),
      }),
    );

    await registry.deregisterSessionTools('session-1');
    expect(registrar.unregister).toHaveBeenCalledWith('app:weather.get_forecast');
  });
});
