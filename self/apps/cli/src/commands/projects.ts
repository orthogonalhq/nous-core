/**
 * Projects command — list, create, switch projects.
 */
import type { CliTrpcClient } from '../trpc-client.js';

export async function runProjectsList(client: CliTrpcClient): Promise<number> {
  try {
    const projects = await client.projects.list.query();
    if (projects.length === 0) {
      console.log('No projects. Create one with: nous projects create --name <name>');
      return 0;
    }
    for (const p of projects) {
      console.log(`${p.id}\t${p.name}\t${p.type}`);
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runProjectsCreate(
  client: CliTrpcClient,
  name: string,
): Promise<number> {
  try {
    const project = await client.projects.create.mutate({ name });
    console.log(`Created project: ${project.id}\t${project.name}`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runProjectsSwitch(
  client: CliTrpcClient,
  projectId: string,
): Promise<number> {
  try {
    const project = await client.projects.get.query({
      id: projectId as import('@nous/shared').ProjectId,
    });
    if (!project) {
      console.error(`Project not found: ${projectId}`);
      return 1;
    }
    console.log(`Switched to project: ${project.name} (${project.id})`);
    console.log('Use --project ' + projectId + ' with send/config commands.');
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
