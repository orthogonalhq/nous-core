/**
 * @nous/shared-server welcome module — public re-export barrel (SP 1.6).
 *
 * Aggregates the SP 1.6 V1 welcome surface for consumers (the chat tRPC
 * router and tests). The module owns the seed fragment constant, the
 * coordinator function, and the result discriminated-union type.
 */
export { WELCOME_SEED_FRAGMENT } from './welcome-seed.js';
export {
  fireWelcomeIfUnsent,
  type WelcomeCoordinatorDeps,
  type WelcomeConfigManager,
  type WelcomeFireResult,
  type WelcomeLogChannel,
} from './welcome-coordinator.js';
