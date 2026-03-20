import {
  AppToolRegistrationRecordSchema,
  type AppToolRegistrationRecord,
} from '@nous/shared';

export interface AppToolRegistryDefinition {
  tool_name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

export interface AppToolRegistrar {
  register(
    input: {
      toolId: string;
      definition: AppToolRegistryDefinition;
      sessionId: string;
      appId: string;
    },
  ): Promise<{ witnessRef?: string } | void> | { witnessRef?: string } | void;
  unregister(toolId: string): Promise<void> | void;
}

export class AppToolRegistry {
  private readonly recordsBySession = new Map<string, AppToolRegistrationRecord[]>();

  constructor(private readonly registrar: AppToolRegistrar) {}

  async registerSessionTools(input: {
    appId: string;
    sessionId: string;
    definitions: readonly AppToolRegistryDefinition[];
  }): Promise<AppToolRegistrationRecord[]> {
    const records: AppToolRegistrationRecord[] = [];

    for (const definition of input.definitions) {
      const namespacedToolId = `${input.appId}.${definition.tool_name}`;
      const receipt = await this.registrar.register({
        toolId: namespacedToolId,
        definition,
        sessionId: input.sessionId,
        appId: input.appId,
      });
      const record = AppToolRegistrationRecordSchema.parse({
        app_id: input.appId,
        session_id: input.sessionId,
        tool_name: definition.tool_name,
        namespaced_tool_id: namespacedToolId,
        description: definition.description,
        input_schema: definition.input_schema,
        output_schema: definition.output_schema,
        registration_witness_ref: receipt?.witnessRef,
      });
      records.push(record);
    }

    this.recordsBySession.set(input.sessionId, records);
    return records;
  }

  getSessionRecords(sessionId: string): AppToolRegistrationRecord[] {
    return this.recordsBySession.get(sessionId) ?? [];
  }

  async deregisterSessionTools(sessionId: string): Promise<void> {
    const records = this.recordsBySession.get(sessionId) ?? [];
    for (const record of records) {
      await this.registrar.unregister(record.namespaced_tool_id);
    }
    this.recordsBySession.delete(sessionId);
  }
}
