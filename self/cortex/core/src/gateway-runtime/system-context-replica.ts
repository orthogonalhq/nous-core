import type { GatewayRuntimeHealthSink } from './runtime-health.js';
import type { SystemContextReplica } from './types.js';

export interface ISystemContextReplicaProvider {
  getReplica(): SystemContextReplica;
}

export class SystemContextReplicaProvider implements ISystemContextReplicaProvider {
  constructor(private readonly healthSink: GatewayRuntimeHealthSink) {}

  getReplica(): SystemContextReplica {
    return this.healthSink.getSystemContextReplica();
  }
}
