#!/usr/bin/env node
/**
 * Nous CLI — terminal interface for chat, projects, config.
 */
import { Command } from 'commander';
import { createCliTrpcClient } from './trpc-client.js';
import { runSend } from './commands/send.js';
import { runProjectsList, runProjectsCreate, runProjectsSwitch } from './commands/projects.js';
import { runPkgDiscover } from './commands/pkg.js';
import { runConfigGet, runConfigSet } from './commands/config.js';
import { runWitnessGet, runWitnessList, runWitnessVerify } from './commands/witness.js';
import { runOpctlRequestProof } from './commands/opctl.js';

const DEFAULT_API_PORT = process.env.NOUS_WEB_PORT ?? '4317';
const DEFAULT_API_URL = process.env.NOUS_API_URL ?? `http://localhost:${DEFAULT_API_PORT}`;

async function main(): Promise<number> {
  const program = new Command();
  program
    .name('nous')
    .description('Nous-OSS CLI — terminal interface')
    .option('--api-url <url>', 'API base URL', DEFAULT_API_URL)
    .option('-p, --project <id>', 'Project ID for context')
    .option('--json', 'Output as JSON');

  program
    .command('send <message>')
    .description('Send a message to Nous')
    .action(async (message: string) => {
      const opts = program.opts();
      if (opts.apiUrl !== DEFAULT_API_URL) {
        console.error(`[nous:cli] api=${opts.apiUrl}`);
      }
      console.error(`[nous:cli] command=send`);
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runSend(client, message, opts.project);
      process.exit(code);
    });

  const projectsCmd = program
    .command('projects')
    .description('Manage projects');
  projectsCmd
    .command('list')
    .description('List all projects')
    .action(async () => {
      console.error(`[nous:cli] command=projects-list`);
      const client = createCliTrpcClient(program.opts().apiUrl);
      const code = await runProjectsList(client);
      process.exit(code);
    });
  projectsCmd
    .command('create')
    .description('Create a new project')
    .requiredOption('--name <name>', 'Project name')
    .action(async (opts: { name: string }) => {
      console.error(`[nous:cli] command=projects-create`);
      const client = createCliTrpcClient(program.opts().apiUrl);
      const code = await runProjectsCreate(client, opts.name);
      process.exit(code);
    });
  projectsCmd
    .command('switch')
    .description('Switch active project')
    .requiredOption('-p, --project <id>', 'Project ID')
    .action(async (opts: { project: string }) => {
      console.error(`[nous:cli] command=projects-switch`);
      const client = createCliTrpcClient(program.opts().apiUrl);
      const code = await runProjectsSwitch(client, opts.project);
      process.exit(code);
    });
  projectsCmd.action(async () => {
    console.error(`[nous:cli] command=projects`);
    const client = createCliTrpcClient(program.opts().apiUrl);
    const code = await runProjectsList(client);
    process.exit(code);
  });

  const pkgCmd = program
    .command('pkg')
    .description('Discover advisory marketplace package suggestions.');
  pkgCmd
    .command('discover')
    .description('Show advisory marketplace suggestions for the current project context')
    .option('--limit <n>', 'Max suggestions to return', (v) => parseInt(v, 10))
    .option(
      '--signal <ref>',
      'Signal reference to use when preparing the feed',
      (value, previous: string[] = []) => {
        previous.push(value);
        return previous;
      },
      [],
    )
    .option('--dismiss <candidateId>', 'Dismiss one candidate once')
    .option('--snooze <candidateId>', 'Snooze one candidate for 30 minutes')
    .option('--mute-category <candidateId>', 'Mute the candidate category')
    .option('--mute-project <candidateId>', 'Mute suggestions for the current project')
    .option('--mute-global <candidateId>', 'Mute suggestions globally')
    .action(async (cmdOpts: {
      limit?: number;
      signal?: string[];
      dismiss?: string;
      snooze?: string;
      muteCategory?: string;
      muteProject?: string;
      muteGlobal?: string;
    }) => {
      console.error(`[nous:cli] command=pkg-discover`);
      const opts = program.opts();
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runPkgDiscover(client, {
        projectId: opts.project,
        limit: cmdOpts.limit,
        signalRefs: cmdOpts.signal ?? [],
        json: opts.json ?? false,
        dismissCandidateId: cmdOpts.dismiss,
        snoozeCandidateId: cmdOpts.snooze,
        muteCategoryCandidateId: cmdOpts.muteCategory,
        muteProjectCandidateId: cmdOpts.muteProject,
        muteGlobalCandidateId: cmdOpts.muteGlobal,
      });
      process.exit(code);
    });
  pkgCmd.action(async () => {
    console.error(`[nous:cli] command=pkg`);
    const opts = program.opts();
    const client = createCliTrpcClient(opts.apiUrl);
    const code = await runPkgDiscover(client, {
      projectId: opts.project,
      json: opts.json ?? false,
    });
    process.exit(code);
  });

  const configCmd = program
    .command('config')
    .description('View and modify configuration');
  configCmd
    .command('get')
    .description('Get current configuration')
    .action(async () => {
      console.error(`[nous:cli] command=config-get`);
      const opts = program.opts();
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runConfigGet(client, opts.json ?? false);
      process.exit(code);
    });
  configCmd
    .command('set')
    .description('Update configuration')
    .option('--Cortex-tier <0-5>', 'Cortex tier (0-5)', (v) => parseInt(v, 10))
    .action(async (cmdOpts: { pfcTier?: number }) => {
      console.error(`[nous:cli] command=config-set`);
      const client = createCliTrpcClient(program.opts().apiUrl);
      const code = await runConfigSet(client, cmdOpts);
      process.exit(code);
    });
  configCmd.action(async () => {
    console.error(`[nous:cli] command=config`);
    const opts = program.opts();
    const client = createCliTrpcClient(opts.apiUrl);
    const code = await runConfigGet(client, opts.json ?? false);
    process.exit(code);
  });

  const witnessCmd = program
    .command('witness')
    .description('Run witness verification and inspect reports');
  witnessCmd
    .command('verify')
    .description('Generate a verification report for the witness evidence chain')
    .option('--from <sequence>', 'Start event sequence', (v) => parseInt(v, 10))
    .option('--to <sequence>', 'End event sequence', (v) => parseInt(v, 10))
    .action(async (cmdOpts: { from?: number; to?: number }) => {
      console.error(`[nous:cli] command=witness-verify`);
      const opts = program.opts();
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runWitnessVerify(client, {
        fromSequence: cmdOpts.from,
        toSequence: cmdOpts.to,
        json: opts.json ?? false,
      });
      process.exit(code);
    });
  witnessCmd
    .command('list')
    .description('List recent witness verification reports')
    .option('--limit <n>', 'Max reports to list', (v) => parseInt(v, 10))
    .action(async (cmdOpts: { limit?: number }) => {
      console.error(`[nous:cli] command=witness-list`);
      const opts = program.opts();
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runWitnessList(client, {
        limit: cmdOpts.limit,
        json: opts.json ?? false,
      });
      process.exit(code);
    });
  witnessCmd
    .command('get')
    .description('Get a witness verification report by id')
    .requiredOption('--id <id>', 'Verification report id')
    .action(async (cmdOpts: { id: string }) => {
      console.error(`[nous:cli] command=witness-get`);
      const opts = program.opts();
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runWitnessGet(client, {
        id: cmdOpts.id,
        json: opts.json ?? false,
      });
      process.exit(code);
    });
  witnessCmd.action(async () => {
    console.error(`[nous:cli] command=witness`);
    const opts = program.opts();
    const client = createCliTrpcClient(opts.apiUrl);
    const code = await runWitnessList(client, {
      json: opts.json ?? false,
    });
    process.exit(code);
  });

  const opctlCmd = program
    .command('opctl')
    .description('Operator control — submit commands and request confirmation');
  opctlCmd
    .command('request-proof')
    .description('Request a confirmation proof for T1/T2/T3 commands')
    .requiredOption('--action <action>', 'Control action (e.g. pause, cancel, hard_stop)')
    .requiredOption('--tier <tier>', 'Confirmation tier (T1, T2, T3)')
    .option('--scope-kind <kind>', 'Scope kind (single_agent, agent_set, project_run)', 'project_run')
    .option('--scope-class <class>', 'Scope class', 'project_run_scope')
    .option('--project <id>', 'Project ID for scope')
    .option('--reason <reason>', 'Reason for confirmation')
    .action(async (cmdOpts: { action: string; tier: string; scopeKind?: string; scopeClass?: string; project?: string; reason?: string }) => {
      console.error(`[nous:cli] command=opctl-request-proof`);
      const opts = program.opts();
      const client = createCliTrpcClient(opts.apiUrl);
      const code = await runOpctlRequestProof(client, {
        scope: {
          kind: cmdOpts.scopeKind ?? 'project_run',
          scopeClass: cmdOpts.scopeClass ?? 'project_run_scope',
          projectId: cmdOpts.project,
        },
        action: cmdOpts.action,
        tier: cmdOpts.tier,
        reason: cmdOpts.reason,
        json: opts.json ?? false,
      });
      process.exit(code);
    });
  opctlCmd.action(async () => {
    console.error(`[nous:cli] command=opctl`);
    console.error('Use: nous opctl request-proof --action <action> --tier <tier>');
    process.exit(0);
  });

  program.parse();
  return 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
