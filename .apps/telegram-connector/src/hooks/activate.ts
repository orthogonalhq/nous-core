import {
  buildTelegramSessionReport,
  type TelegramConnectorHealthInput,
} from '../runtime.ts';
import type { TelegramConnectorConfigInput } from '../config.ts';

export const onActivate = (
  input: TelegramConnectorHealthInput & { config: TelegramConnectorConfigInput },
) => buildTelegramSessionReport(input);
