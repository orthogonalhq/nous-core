import { describe, expect, it } from 'vitest';
import { createAmpProcessRunner } from '../providers/amp/implementation.js';
import type { AgentCliInvocation } from '../protocols/agent-cli/index.js';

// Uses the current Node binary as a stand-in "CLI" via `-e`, so these tests don't
// depend on the real `amp` executable being installed. `command.executable` is
// read directly off the invocation by createAmpProcessRunner, so this substitution
// is exactly what a caller would see in production, just pointed at a different binary.
function invocation(overrides: Partial<AgentCliInvocation> = {}): AgentCliInvocation {
  return {
    command: { executable: process.execPath },
    ...overrides,
  } as AgentCliInvocation;
}

describe('createAmpProcessRunner', () => {
  it('captures stdout and reports ok:true on a zero exit', async () => {
    const runner = createAmpProcessRunner();
    const result = await runner.run(invocation({
      command: { executable: process.execPath, args: ['-e', 'process.stdout.write("hello")'] },
    }));

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('reports non_zero_exit failure with captured stderr', async () => {
    const runner = createAmpProcessRunner();
    const result = await runner.run(invocation({
      command: {
        executable: process.execPath,
        args: ['-e', 'process.stderr.write("boom"); process.exit(3)'],
      },
    }));

    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('non_zero_exit');
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('boom');
  });

  it('reports spawn_error for a nonexistent executable', async () => {
    const runner = createAmpProcessRunner();
    const result = await runner.run(invocation({
      command: { executable: 'this-binary-does-not-exist-anywhere' },
    }));

    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('spawn_error');
  });

  it('times out, kills the process, and reports timedOut:true', async () => {
    const runner = createAmpProcessRunner({ sigtermGraceMs: 50 });
    const result = await runner.run(invocation({
      command: { executable: process.execPath, args: ['-e', 'setTimeout(() => {}, 5000)'] },
      timeoutMs: 50,
    }));

    expect(result.failure?.kind).toBe('timeout');
    expect(result.failure?.timedOut).toBe(true);
  }, 2_000);

  it('resolves immediately without spawning when the signal is already aborted', async () => {
    const runner = createAmpProcessRunner();
    const result = await runner.run(
      invocation({ command: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }),
      { signal: { aborted: true } },
    );

    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('spawn_error');
    expect(result.failure?.message).toContain('aborted before start');
  });

  it('writes invocation.input to stdin', async () => {
    const runner = createAmpProcessRunner();
    const result = await runner.run(invocation({
      command: {
        executable: process.execPath,
        args: ['-e', 'process.stdin.on("data", (c) => process.stdout.write(c))'],
      },
      input: 'prompt text',
    }));

    expect(result.stdout).toBe('prompt text');
  });
});