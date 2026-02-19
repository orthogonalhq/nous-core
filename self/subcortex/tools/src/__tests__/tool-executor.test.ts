import { describe, it, expect } from 'vitest';
import { ToolExecutor } from '../tool-executor.js';

describe('ToolExecutor', () => {
  it('implements IToolExecutor — execute echo returns ToolResult', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('echo', { message: 'hello' });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ echoed: 'hello' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('execute() with invalid params returns success false', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('echo', { wrong: 'params' });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('execute() with missing message returns success false', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('echo', {});

    expect(result.success).toBe(false);
  });

  it('execute() with unknown tool returns success false', async () => {
    const executor = new ToolExecutor();
    const result = await executor.execute('unknown', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('listTools() includes echo', async () => {
    const executor = new ToolExecutor();
    const tools = await executor.listTools();

    expect(tools.some((t) => t.name === 'echo')).toBe(true);
    const echo = tools.find((t) => t.name === 'echo');
    expect(echo?.capabilities).toContain('read');
  });
});
