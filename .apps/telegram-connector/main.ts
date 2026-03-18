import { createTelegramConnectorRuntime } from './src/runtime.ts';

const runtime = createTelegramConnectorRuntime();

if (import.meta.main) {
  console.log(
    JSON.stringify({
      app: 'telegram-connector',
      tools: runtime.tools,
      capabilities: runtime.capabilities,
    }),
  );
}

export default runtime;
