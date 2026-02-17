/**
 * NousContext — server-side context for tRPC procedures.
 *
 * Holds the wired Nous stack: core executor, stores, config, etc.
 */
import type { ICoreExecutor, IProjectStore, IStmStore } from '@nous/shared';
import type { MwcPipeline } from '@nous/memory-mwc';
import type { IDocumentStore } from '@nous/shared';
import type { IModelRouter } from '@nous/shared';
import type { IConfig } from '@nous/shared';
import type { ProviderId } from '@nous/shared';
import type { IModelProvider } from '@nous/shared';

export interface NousContext {
  coreExecutor: ICoreExecutor;
  projectStore: IProjectStore;
  stmStore: IStmStore;
  mwcPipeline: MwcPipeline;
  documentStore: IDocumentStore;
  config: IConfig;
  router: IModelRouter;
  getProvider: (id: ProviderId) => IModelProvider | null;
}
