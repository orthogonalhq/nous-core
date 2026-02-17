/**
 * Send command — send a message to Nous and display the response.
 */
import type { ProjectId } from '@nous/shared';
import type { CliTrpcClient } from '../trpc-client.js';

export async function runSend(
  client: CliTrpcClient,
  message: string,
  projectId?: string,
): Promise<number> {
  try {
    const result = await client.chat.sendMessage.mutate({
      message,
      projectId: projectId as ProjectId | undefined,
    });
    console.log(result.response);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('fetch') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('connection')
    ) {
      console.error(
        'Cannot connect to Nous. Is the backend running? Start with: pnpm dev:web',
      );
    } else {
      console.error(msg);
    }
    return 1;
  }
}
