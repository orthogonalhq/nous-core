/**
 * Amp provider leaf — public exports required by the provider generator.
 *
 * The generator discovers this leaf under `providers/amp/` and expects each
 * of these four named exports to be present. Do not remove or rename them.
 */
export { providerAdapter } from './adapter.js';
export { providerDefinition } from './definition.js';
export { providerFactory } from './provider.js';
export { AmpProvider } from './implementation.js';
