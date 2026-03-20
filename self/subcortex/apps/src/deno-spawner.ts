import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { AppLaunchSpec } from '@nous/shared';

export interface DenoSpawnHandle {
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface DenoSpawnReceipt {
  sessionId: string;
  pid: number;
  startedAt: string;
  command: string;
  args: string[];
  handle: DenoSpawnHandle;
}

export interface DenoSpawnerOptions {
  command?: string;
  now?: () => Date;
  sessionIdFactory?: () => string;
  spawnProcess?: (command: string, args: readonly string[]) => {
    pid?: number;
    kill(signal?: NodeJS.Signals | number): boolean;
  };
}

export class DenoSpawner {
  private readonly command: string;
  private readonly now: () => Date;
  private readonly sessionIdFactory: () => string;
  private readonly spawnProcess: NonNullable<DenoSpawnerOptions['spawnProcess']>;

  constructor(options: DenoSpawnerOptions = {}) {
    this.command = options.command ?? 'deno';
    this.now = options.now ?? (() => new Date());
    this.sessionIdFactory = options.sessionIdFactory ?? randomUUID;
    this.spawnProcess =
      options.spawnProcess ??
      ((command, args) => spawn(command, args, { stdio: 'pipe' }));
  }

  spawn(spec: AppLaunchSpec): DenoSpawnReceipt {
    const child = this.spawnProcess(this.command, spec.deno_args);
    return {
      sessionId: this.sessionIdFactory(),
      pid: child.pid ?? -1,
      startedAt: this.now().toISOString(),
      command: this.command,
      args: [...spec.deno_args],
      handle: {
        kill: (signal?: NodeJS.Signals | number) => child.kill(signal),
      },
    };
  }
}
