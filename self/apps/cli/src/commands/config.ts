/**
 * Config command — view and modify configuration.
 */
import type { CliTrpcClient } from '../trpc-client.js';

export async function runConfigGet(
  client: CliTrpcClient,
  json: boolean,
): Promise<number> {
  try {
    const config = await client.config.get.query();
    if (json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log('PFC Tier:', config.pfcTier);
      console.log(
        'Model assignments:',
        JSON.stringify(config.modelRoleAssignments ?? [], null, 2),
      );
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runConfigSet(
  client: CliTrpcClient,
  options: { pfcTier?: number },
): Promise<number> {
  try {
    if (options.pfcTier !== undefined) {
      await client.config.update.mutate({ pfcTier: options.pfcTier });
      console.log('Updated PFC tier to', options.pfcTier);
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
