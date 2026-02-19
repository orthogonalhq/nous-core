#!/usr/bin/env node
/**
 * Nous CLI — terminal interface for chat, projects, config.
 */
import { Command } from 'commander';
import { createCliTrpcClient } from './trpc-client.js';
import { runSend } from './commands/send.js';
import { runProjectsList, runProjectsCreate, runProjectsSwitch } from './commands/projects.js';
import { runConfigGet, runConfigSet } from './commands/config.js';

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
    .option('--pfc-tier <0-5>', 'PFC tier (0-5)', (v) => parseInt(v, 10))
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

  program.parse();
  return 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
