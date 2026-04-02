/**
 * tRPC root router — shared between web and desktop runtimes.
 */
import { router } from './trpc';
import { projectsRouter } from './routers/projects';
import { chatRouter } from './routers/chat';
import { tracesRouter } from './routers/traces';
import { memoryRouter } from './routers/memory';
import { configRouter } from './routers/config';
import { healthRouter } from './routers/health';
import { firstRunRouter } from './routers/first-run';
import { witnessRouter } from './routers/witness';
import { opctlRouter } from './routers/opctl';
import { maoRouter } from './routers/mao';
import { gtmRouter } from './routers/gtm';
import { discoveryRouter } from './routers/discovery';
import { escalationsRouter } from './routers/escalations';
import { marketplaceRouter } from './routers/marketplace';
import { packagesRouter } from './routers/packages';
import { voiceRouter } from './routers/voice';
import { mobileRouter } from './routers/mobile';
import { codingAgentsRouter } from './routers/coding-agents';
import { preferencesRouter } from './routers/preferences';
import { hardwareRouter } from './routers/hardware';
import { inferenceRouter } from './routers/inference';
import { costGovernanceRouter } from './routers/cost-governance';
import { systemActivityRouter } from './routers/system-activity';

export const appRouter = router({
  projects: projectsRouter,
  escalations: escalationsRouter,
  chat: chatRouter,
  traces: tracesRouter,
  memory: memoryRouter,
  config: configRouter,
  health: healthRouter,
  firstRun: firstRunRouter,
  witness: witnessRouter,
  opctl: opctlRouter,
  mao: maoRouter,
  gtm: gtmRouter,
  discovery: discoveryRouter,
  marketplace: marketplaceRouter,
  packages: packagesRouter,
  voice: voiceRouter,
  mobile: mobileRouter,
  codingAgents: codingAgentsRouter,
  preferences: preferencesRouter,
  hardware: hardwareRouter,
  systemActivity: systemActivityRouter,
  inference: inferenceRouter,
  costGovernance: costGovernanceRouter,
});

export type AppRouter = typeof appRouter;
