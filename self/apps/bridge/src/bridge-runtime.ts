import type {
  CommunicationEgressOutcome,
  CommunicationIngressOutcome,
  IDocumentStore,
  ICommunicationGatewayService,
  IEscalationService,
  INudgeDiscoveryService,
  IWitnessService,
} from '@nous/shared';
import { CommunicationGatewayService } from '@nous/subcortex-communication-gateway';
import type { BridgeOutboundMessage, TelegramUpdate } from './connectors/connector-types.js';
import { TelegramBotAdapter } from './connectors/telegram-bot-adapter.js';

export interface BridgeRuntimeOptions {
  adapter: TelegramBotAdapter;
  gatewayService?: ICommunicationGatewayService;
  documentStore?: IDocumentStore;
  escalationService?: IEscalationService;
  nudgeDiscoveryService?: INudgeDiscoveryService;
  witnessService?: IWitnessService;
  authorizedAccountIds?: readonly string[];
  allowGroupConversations?: boolean;
  allowThreads?: boolean;
  requireMentionForSharedConversations?: boolean;
  now?: () => string;
  idFactory?: () => string;
}

export class BridgeRuntime {
  readonly gatewayService: ICommunicationGatewayService;
  readonly connectorId: string;

  constructor(private readonly options: BridgeRuntimeOptions) {
    this.connectorId = `connector:telegram:${options.adapter.accountId}`;
    this.gatewayService = options.gatewayService ??
      new CommunicationGatewayService({
        documentStore: options.documentStore,
        deliveryProvider: options.adapter,
        escalationService: options.escalationService,
        nudgeDiscoveryService: options.nudgeDiscoveryService,
        witnessService: options.witnessService,
        authorizedAccountIds: options.authorizedAccountIds,
        allowGroupConversations: options.allowGroupConversations,
        allowThreads: options.allowThreads,
        requireMentionForSharedConversations:
          options.requireMentionForSharedConversations,
        now: options.now,
        idFactory: options.idFactory,
      });
    if (this.gatewayService instanceof CommunicationGatewayService) {
      this.gatewayService.registerConnector({
        connector_id: this.connectorId,
        kind: 'telegram',
        account_id: options.adapter.accountId,
      });
    }
  }

  async handleTelegramUpdate(
    update: TelegramUpdate,
  ): Promise<CommunicationIngressOutcome> {
    const envelope = this.options.adapter.normalizeIngress(update);
    return this.gatewayService.receiveIngress(envelope);
  }

  async dispatchTelegramMessage(
    message: BridgeOutboundMessage,
  ): Promise<CommunicationEgressOutcome> {
    const envelope = this.options.adapter.buildEgressEnvelope(message);
    return this.gatewayService.dispatchEgress(envelope);
  }
}
