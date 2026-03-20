import {
  buildTelegramSyncUpdatesIntent,
  type TelegramSyncUpdatesInput,
} from '../runtime.ts';

export const runSyncUpdatesTool = (input: TelegramSyncUpdatesInput) =>
  buildTelegramSyncUpdatesIntent(input);
