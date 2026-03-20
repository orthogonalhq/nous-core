import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  AppInstallHookInputSchema,
  AppInstallHookResultSchema,
  type AppInstallHookInput,
  type AppInstallHookResult,
} from '@nous/shared';

const execFileAsync = promisify(execFile);

const DENO_INSTALL_HOOK_SCRIPT = [
  'const [hookUrl, payloadJson] = Deno.args;',
  'const payload = JSON.parse(payloadJson);',
  "const mod = await import(hookUrl);",
  "const value = typeof mod.onInstall === 'function'",
  "  ? await mod.onInstall(payload)",
  "  : { status: 'success', results: [] };",
  'console.log(JSON.stringify(value ?? { status: "success", results: [] }));',
].join('\n');

export interface InstallHookRunnerOptions {
  command?: string;
  execute?: (
    command: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>;
}

function normalizeHookOutput(output: unknown): AppInstallHookResult {
  const record =
    typeof output === 'object' && output != null && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : {};
  const results = Array.isArray(record.results)
    ? record.results
    : Array.isArray(record.validation)
      ? record.validation
      : [];
  const metadata = Object.fromEntries(
    Object.entries(record).filter(([key]) =>
      key !== 'status' && key !== 'results' && key !== 'validation'),
  );

  return AppInstallHookResultSchema.parse({
    status:
      record.status === 'success' ||
      record.status === 'partial' ||
      record.status === 'failed'
        ? record.status
        : 'success',
    results,
    metadata,
  });
}

export class InstallHookRunner {
  private readonly command: string;
  private readonly execute: (
    command: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>;

  constructor(options: InstallHookRunnerOptions = {}) {
    this.command = options.command ?? 'deno';
    this.execute =
      options.execute ??
      (async (command, args) => {
        const result = await execFileAsync(command, args, {
          encoding: 'utf8',
          windowsHide: true,
        });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
        };
      });
  }

  async runOnInstall(input: {
    hook_ref?: string;
    payload: AppInstallHookInput;
  }): Promise<AppInstallHookResult> {
    if (!input.hook_ref) {
      return AppInstallHookResultSchema.parse({
        status: 'success',
        results: [],
        metadata: {},
      });
    }

    const payload = AppInstallHookInputSchema.parse(input.payload);
    const hookUrl = pathToFileURL(input.hook_ref).href;
    const args = [
      'eval',
      `--allow-read=${dirname(input.hook_ref)}`,
      '--quiet',
      DENO_INSTALL_HOOK_SCRIPT,
      hookUrl,
      JSON.stringify(payload),
    ];
    const result = await this.execute(this.command, args);
    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      throw new Error(
        result.stderr.trim() || `Install hook ${input.hook_ref} produced no output.`,
      );
    }

    return normalizeHookOutput(JSON.parse(rawOutput));
  }
}

