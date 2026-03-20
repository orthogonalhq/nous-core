/**
 * Tests for the shared bootstrap module surface.
 *
 * These tests verify the BootstrapConfig interface contract and
 * the module structure without instantiating the full service graph
 * (which requires all workspace packages to be resolvable).
 *
 * Full integration testing is done at the web/desktop level where
 * the full dependency tree is available.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('@nous/shared-server package structure', () => {
  it('has a valid package.json with correct name', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('@nous/shared-server');
  });

  it('has main entry pointing to src/index.ts', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.main).toBe('./src/index.ts');
  });

  it('has required source files', () => {
    const requiredFiles = [
      'src/index.ts',
      'src/bootstrap.ts',
      'src/context.ts',
      'src/first-run.ts',
      'src/trpc/trpc.ts',
      'src/trpc/root.ts',
    ];

    for (const file of requiredFiles) {
      expect(existsSync(join(ROOT, file)), `Missing: ${file}`).toBe(true);
    }
  });

  it('has all expected router files', () => {
    const expectedRouters = [
      'chat', 'config', 'discovery', 'escalations', 'first-run',
      'gtm', 'health', 'mao', 'marketplace', 'memory', 'mobile',
      'opctl', 'packages', 'projects', 'traces', 'voice', 'witness',
    ];

    for (const name of expectedRouters) {
      const path = join(ROOT, 'src/trpc/routers', `${name}.ts`);
      expect(existsSync(path), `Missing router: ${name}.ts`).toBe(true);
    }
  });

  it('index.ts exports expected symbols', () => {
    const content = readFileSync(join(ROOT, 'src/index.ts'), 'utf-8');

    expect(content).toContain('createNousServices');
    expect(content).toContain('BootstrapConfig');
    expect(content).toContain('NousContext');
    expect(content).toContain('appRouter');
    expect(content).toContain('AppRouter');
    expect(content).toContain('createTRPCContext');
  });

  it('bootstrap.ts exports createNousServices and BootstrapConfig', () => {
    const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');

    expect(content).toContain('export function createNousServices');
    expect(content).toContain('export interface BootstrapConfig');
  });

  it('bootstrap.ts accepts BootstrapConfig with expected fields', () => {
    const content = readFileSync(join(ROOT, 'src/bootstrap.ts'), 'utf-8');

    // Verify the BootstrapConfig interface has the expected fields
    expect(content).toContain('configPath?:');
    expect(content).toContain('dataDir?:');
    expect(content).toContain('instanceRoot?:');
    expect(content).toContain('publicBaseUrl?:');
    expect(content).toContain('runtimeLabel?:');
  });

  it('context.ts exports NousContext interface', () => {
    const content = readFileSync(join(ROOT, 'src/context.ts'), 'utf-8');

    expect(content).toContain('export interface NousContext');
    // Verify key service fields exist
    expect(content).toContain('coreExecutor:');
    expect(content).toContain('gatewayRuntime:');
    expect(content).toContain('documentStore:');
    expect(content).toContain('dataDir:');
  });

  it('has all workspace dependencies declared in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const deps = pkg.dependencies || {};

    // Verify critical workspace dependencies are declared
    const required = [
      '@nous/shared',
      '@nous/autonomic-config',
      '@nous/autonomic-storage',
      '@nous/cortex-core',
      '@nous/cortex-pfc',
      '@nous/subcortex-projects',
      '@nous/subcortex-providers',
      '@trpc/server',
      'superjson',
    ];

    for (const dep of required) {
      expect(deps[dep], `Missing dependency: ${dep}`).toBeDefined();
    }
  });
});
