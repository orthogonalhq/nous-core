import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type {
  AppPackageManifest,
  IRuntime,
  LoadedAppPackage,
  LoadedSkillPackage,
  LoadedWorkflowPackage,
  ProjectConfig,
  ProjectWorkflowPackageBinding,
  ResolvedWorkflowDefinitionSource,
  WorkflowLifecycleDefinitionSummary,
  WorkflowLifecycleInspectResult,
  WorkflowDefinition,
  WorkflowFlowDocument,
  WorkflowNodeDefinition,
} from '@nous/shared';
import {
  AppPackageManifestSchema,
  AtomicSkillFrontmatterSchema,
  CompositeSkillFrontmatterSchema,
  LoadedAppPackageSchema,
  LoadedSkillPackageSchema,
  LoadedWorkflowPackageSchema,
  ProjectWorkflowPackageBindingSchema,
  ResolvedWorkflowDefinitionSourceSchema,
  SkillFrontmatterBaseSchema,
  SkillPackageKindSchema,
  WorkflowLifecycleDefinitionSummarySchema,
  WorkflowLifecycleInspectResultSchema,
  WorkflowDefinitionSchema,
  WorkflowFlowDocumentSchema,
  WorkflowManifestFrontmatterSchema,
  WorkflowNodeDefinitionSchema,
  WorkflowStepFrontmatterSchema,
} from '@nous/shared';
import { discoverCanonicalPackageStores, getCanonicalStoreEntry } from './discovery.js';
import { createLegacyHybridBridgeView } from './legacy-hybrid-bridge.js';

const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

const normalizeRelativeRef = (value: string): string =>
  value.replace(/\\/g, '/');

const deterministicUuid = (seed: string): string => {
  const digest = createHash('sha256').update(seed).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-');
};

const parseScalar = (input: string): unknown => {
  const value = input.trim();
  if (value === '') {
    return '';
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const findMappingSeparator = (line: string): number => {
  let inSingle = false;
  let inDouble = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) {
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      continue;
    }
    if (char === ']') {
      bracketDepth -= 1;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth -= 1;
      continue;
    }
    if (char === ':' && bracketDepth === 0 && braceDepth === 0) {
      return index;
    }
  }

  return -1;
};

interface ParsedYamlLine {
  indent: number;
  text: string;
}

const toParsedLines = (source: string): ParsedYamlLine[] =>
  source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => ({
      indent: line.match(/^ */)?.[0].length ?? 0,
      text: line.trimEnd(),
    }))
    .filter((line) => {
      const trimmed = line.text.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    });

const parseYamlBlock = (
  lines: readonly ParsedYamlLine[],
  startIndex: number,
  indent: number,
): { value: unknown; nextIndex: number } => {
  if (startIndex >= lines.length) {
    return { value: {}, nextIndex: startIndex };
  }

  const line = lines[startIndex]!;
  if (line.indent < indent) {
    return { value: {}, nextIndex: startIndex };
  }

  if (line.text.trimStart().startsWith('- ')) {
    return parseYamlArray(lines, startIndex, indent);
  }

  return parseYamlObject(lines, startIndex, indent);
};

const parseYamlObject = (
  lines: readonly ParsedYamlLine[],
  startIndex: number,
  indent: number,
): { value: Record<string, unknown>; nextIndex: number } => {
  const result: Record<string, unknown> = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.text.trim();
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`Unexpected indentation while parsing YAML object: ${line.text}`);
    }
    if (trimmed.startsWith('- ')) {
      break;
    }

    const separator = findMappingSeparator(trimmed);
    if (separator < 0) {
      throw new Error(`Expected key/value mapping in YAML line: ${line.text}`);
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    index += 1;

    if (rawValue !== '') {
      result[key] = parseScalar(rawValue);
      continue;
    }

    if (index < lines.length && lines[index]!.indent > line.indent) {
      const nested = parseYamlBlock(lines, index, lines[index]!.indent);
      result[key] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    result[key] = null;
  }

  return { value: result, nextIndex: index };
};

const parseYamlArray = (
  lines: readonly ParsedYamlLine[],
  startIndex: number,
  indent: number,
): { value: unknown[]; nextIndex: number } => {
  const result: unknown[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.text.trim();
    if (line.indent < indent) {
      break;
    }
    if (line.indent !== indent || !trimmed.startsWith('- ')) {
      break;
    }

    const rawItem = trimmed.slice(2).trim();
    index += 1;

    if (rawItem === '') {
      if (index < lines.length && lines[index]!.indent > line.indent) {
        const nested = parseYamlBlock(lines, index, lines[index]!.indent);
        result.push(nested.value);
        index = nested.nextIndex;
      } else {
        result.push(null);
      }
      continue;
    }

    const separator = findMappingSeparator(rawItem);
    if (separator >= 0) {
      const key = rawItem.slice(0, separator).trim();
      const rawValue = rawItem.slice(separator + 1).trim();
      const item: Record<string, unknown> = {};
      item[key] =
        rawValue === ''
          ? null
          : parseScalar(rawValue);

      if (rawValue === '' && index < lines.length && lines[index]!.indent > line.indent) {
        const nested = parseYamlBlock(lines, index, lines[index]!.indent);
        item[key] = nested.value;
        index = nested.nextIndex;
      }

      if (index < lines.length && lines[index]!.indent > line.indent) {
        const nested = parseYamlObject(lines, index, lines[index]!.indent);
        Object.assign(item, nested.value);
        index = nested.nextIndex;
      }

      result.push(item);
      continue;
    }

    result.push(parseScalar(rawItem));
  }

  return { value: result, nextIndex: index };
};

const parseSimpleYamlDocument = (source: string): unknown => {
  const lines = toParsedLines(source);
  if (lines.length === 0) {
    return {};
  }
  return parseYamlBlock(lines, 0, lines[0]!.indent).value;
};

const parseMarkdownFrontmatter = (
  source: string,
): { frontmatter: unknown; body: string } => {
  const match = source.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {
      frontmatter: {},
      body: source.trim(),
    };
  }

  return {
    frontmatter: parseSimpleYamlDocument(match[1]!),
    body: source.slice(match[0].length).trim(),
  };
};

const resolveSafeChildPath = (rootPath: string, childPath: string): string => {
  const resolvedPath = resolve(rootPath, childPath);
  const relativePath = relative(rootPath, resolvedPath);
  if (relativePath.startsWith('..')) {
    throw new Error(`Path escapes package root: ${childPath}`);
  }
  return resolvedPath;
};

const readText = async (path: string): Promise<string> => readFile(path, 'utf8');

const readInstalledPackageVersion = async (
  runtime: IRuntime,
  rootPath: string,
): Promise<string | undefined> => {
  const metadataPath = runtime.resolvePath(rootPath, '.nous-package.json');
  if (!(await runtime.exists(metadataPath))) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(await readText(metadataPath)) as {
      package_version?: unknown;
    };
    return typeof parsed.package_version === 'string'
      ? parsed.package_version
      : undefined;
  } catch {
    return undefined;
  }
};

const readDirectoryRefs = async (
  runtime: IRuntime,
  rootPath: string,
  dirName: string,
): Promise<string[]> => {
  const dirPath = runtime.resolvePath(rootPath, dirName);
  if (!(await runtime.exists(dirPath))) {
    return [];
  }

  return (await runtime.listDirectory(dirPath))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => normalizeRelativeRef(`${dirName}/${entry}`));
};

const loadResourceRefs = async (
  runtime: IRuntime,
  rootPath: string,
): Promise<{
  references: string[];
  scripts: string[];
  assets: string[];
}> => ({
  references: await readDirectoryRefs(runtime, rootPath, 'references'),
  scripts: await readDirectoryRefs(runtime, rootPath, 'scripts'),
  assets: await readDirectoryRefs(runtime, rootPath, 'assets'),
});

const normalizeSkillFrontmatter = (
  rawFrontmatter: Record<string, unknown>,
  kind: 'atomic' | 'composite' | 'legacy_hybrid',
) => {
  if (kind === 'composite') {
    return CompositeSkillFrontmatterSchema.parse(rawFrontmatter);
  }

  if (kind === 'legacy_hybrid') {
    const base = SkillFrontmatterBaseSchema.parse(rawFrontmatter);
    return AtomicSkillFrontmatterSchema.parse(base);
  }

  return AtomicSkillFrontmatterSchema.parse(rawFrontmatter);
};

const classifySkillPackageKind = async (input: {
  runtime: IRuntime;
  rootPath: string;
  frontmatter: Record<string, unknown>;
}): Promise<'atomic' | 'composite' | 'legacy_hybrid'> => {
  const hasLegacyRoutingKeys =
    'skill_slug' in input.frontmatter ||
    'entrypoint_mode_slug' in input.frontmatter ||
    'entrypoint_mode_slugs' in input.frontmatter;
  const hasLegacyFlow =
    (await input.runtime.exists(input.runtime.resolvePath(input.rootPath, 'nous.flow.yaml'))) ||
    (await input.runtime.exists(input.runtime.resolvePath(input.rootPath, 'steps')));
  if (hasLegacyRoutingKeys || hasLegacyFlow) {
    return 'legacy_hybrid';
  }

  const metadataNous =
    input.frontmatter.metadata &&
    typeof input.frontmatter.metadata === 'object' &&
    input.frontmatter.metadata != null &&
    'nous' in input.frontmatter.metadata &&
    typeof input.frontmatter.metadata.nous === 'object' &&
    input.frontmatter.metadata.nous != null
      ? (input.frontmatter.metadata.nous as Record<string, unknown>)
      : undefined;

  if (
    ('dependencies' in input.frontmatter &&
      typeof input.frontmatter.dependencies === 'object' &&
      input.frontmatter.dependencies != null &&
      'skills' in input.frontmatter.dependencies) ||
    metadataNous?.['skill-tier'] === 'composite'
  ) {
    return 'composite';
  }

  return 'atomic';
};

const resolvePackagePath = async (input: {
  instanceRoot: string;
  runtime: IRuntime;
  rootDir: '.apps' | '.skills' | '.workflows';
  packageId: string;
}): Promise<string> => {
  const snapshot = await discoverCanonicalPackageStores({
    instanceRoot: input.instanceRoot,
    runtime: input.runtime,
  });
  const store = getCanonicalStoreEntry(snapshot, input.rootDir);
  if (!store || store.surface !== 'package_store') {
    throw new Error(`Canonical store ${input.rootDir} is unavailable`);
  }

  const packageDirName = sanitizePackageId(input.packageId);
  const primaryPath = input.runtime.resolvePath(store.absolutePath, packageDirName);
  if (await input.runtime.exists(primaryPath)) {
    return primaryPath;
  }

  if (store.systemDir) {
    const systemPath = input.runtime.resolvePath(store.systemDir, packageDirName);
    if (await input.runtime.exists(systemPath)) {
      return systemPath;
    }
  }

  return primaryPath;
};

const listInstalledPackageRoots = async (input: {
  instanceRoot: string;
  runtime: IRuntime;
  rootDir: '.apps' | '.skills' | '.workflows';
}): Promise<Array<{ packageId: string; rootPath: string }>> => {
  const snapshot = await discoverCanonicalPackageStores({
    instanceRoot: input.instanceRoot,
    runtime: input.runtime,
  });
  const store = getCanonicalStoreEntry(snapshot, input.rootDir);
  if (!store || store.surface !== 'package_store') {
    throw new Error(`Canonical store ${input.rootDir} is unavailable`);
  }

  const entries: Array<{ packageId: string; rootPath: string }> = [];
  const readEntries = async (basePath: string) => {
    if (!(await input.runtime.exists(basePath))) {
      return;
    }

    const names = (await input.runtime.listDirectory(basePath)).sort((left, right) =>
      left.localeCompare(right),
    );
    for (const name of names) {
      if (name.startsWith('.')) {
        continue;
      }
      entries.push({
        packageId: name,
        rootPath: input.runtime.resolvePath(basePath, name),
      });
    }
  };

  await readEntries(store.absolutePath);
  if (store.systemDir) {
    await readEntries(store.systemDir);
  }

  const deduped = new Map<string, { packageId: string; rootPath: string }>();
  for (const entry of entries) {
    if (!deduped.has(entry.packageId)) {
      deduped.set(entry.packageId, entry);
    }
  }

  return [...deduped.values()].sort((left, right) =>
    left.packageId.localeCompare(right.packageId),
  );
};

export interface LoadInstalledSkillPackageOptions {
  instanceRoot: string;
  runtime: IRuntime;
  packageId: string;
}

export const loadInstalledSkillPackage = async (
  options: LoadInstalledSkillPackageOptions,
): Promise<LoadedSkillPackage> => {
  const rootPath = await resolvePackagePath({
    instanceRoot: options.instanceRoot,
    runtime: options.runtime,
    rootDir: '.skills',
    packageId: options.packageId,
  });
  const manifestPath = options.runtime.resolvePath(rootPath, 'SKILL.md');
  if (!(await options.runtime.exists(manifestPath))) {
    throw new Error(`Installed skill package is missing SKILL.md: ${options.packageId}`);
  }

  const manifest = await readText(manifestPath);
  const parsedManifest = parseMarkdownFrontmatter(manifest);
  const rawFrontmatter =
    parsedManifest.frontmatter &&
    typeof parsedManifest.frontmatter === 'object' &&
    !Array.isArray(parsedManifest.frontmatter)
      ? (parsedManifest.frontmatter as Record<string, unknown>)
      : {};
  const kind = await classifySkillPackageKind({
    runtime: options.runtime,
    rootPath,
    frontmatter: rawFrontmatter,
  });
  const legacyWorkflowRefs = createLegacyHybridBridgeView({
    flowRef: (await options.runtime.exists(options.runtime.resolvePath(rootPath, 'nous.flow.yaml')))
      ? normalizeRelativeRef('nous.flow.yaml')
      : undefined,
    stepRefs: (await options.runtime.exists(options.runtime.resolvePath(rootPath, 'steps')))
      ? (await options.runtime.listDirectory(options.runtime.resolvePath(rootPath, 'steps')))
          .sort((left, right) => left.localeCompare(right))
          .map((entry) => normalizeRelativeRef(`steps/${entry}`))
      : [],
  });

  return LoadedSkillPackageSchema.parse({
    packageId: options.packageId,
    packageVersion: await readInstalledPackageVersion(options.runtime, rootPath),
    rootRef: rootPath,
    manifestRef: manifestPath,
    kind: SkillPackageKindSchema.parse(kind),
    frontmatter: normalizeSkillFrontmatter(rawFrontmatter, kind),
    body: parsedManifest.body,
    resourceRefs: await loadResourceRefs(options.runtime, rootPath),
    legacyWorkflowRefs,
  });
};

export interface LoadedCompositeSkillDependencyGraph {
  rootPackage: LoadedSkillPackage;
  packages: Record<string, LoadedSkillPackage>;
  loadOrder: string[];
}

export const loadCompositeSkillDependencyGraph = async (
  options: LoadInstalledSkillPackageOptions,
): Promise<LoadedCompositeSkillDependencyGraph> => {
  const packages = new Map<string, LoadedSkillPackage>();
  const loadOrder: string[] = [];
  const active = new Set<string>();

  const visit = async (packageId: string): Promise<LoadedSkillPackage> => {
    if (active.has(packageId)) {
      throw new Error(`Composite skill dependency cycle detected at ${packageId}`);
    }
    if (packages.has(packageId)) {
      return packages.get(packageId)!;
    }

    active.add(packageId);
    const loaded = await loadInstalledSkillPackage({
      instanceRoot: options.instanceRoot,
      runtime: options.runtime,
      packageId,
    });
    packages.set(packageId, loaded);

    if (loaded.kind === 'composite' && loaded.frontmatter) {
      const compositeFrontmatter = CompositeSkillFrontmatterSchema.parse(
        loaded.frontmatter,
      );
      for (const dependency of compositeFrontmatter.dependencies.skills) {
        await visit(dependency.name);
      }
    }

    active.delete(packageId);
    loadOrder.push(packageId);
    return loaded;
  };

  const rootPackage = await visit(options.packageId);
  return {
    rootPackage,
    packages: Object.fromEntries(packages.entries()),
    loadOrder,
  };
};

export interface LoadInstalledWorkflowPackageOptions {
  instanceRoot: string;
  runtime: IRuntime;
  packageId: string;
}

export interface LoadInstalledAppPackageOptions {
  instanceRoot: string;
  runtime: IRuntime;
  packageId: string;
}

const normalizeWorkflowManifest = (
  rawFrontmatter: Record<string, unknown>,
) => {
  const parsed = WorkflowManifestFrontmatterSchema.parse(rawFrontmatter);
  return {
    ...parsed,
    entrypoints:
      parsed.entrypoints && parsed.entrypoints.length > 0
        ? parsed.entrypoints
        : [parsed.entrypoint],
  };
};

const parseWorkflowFlowDocument = (source: string): WorkflowFlowDocument =>
  WorkflowFlowDocumentSchema.parse(parseSimpleYamlDocument(source));

export const loadInstalledWorkflowPackage = async (
  options: LoadInstalledWorkflowPackageOptions,
): Promise<LoadedWorkflowPackage> => {
  const rootPath = await resolvePackagePath({
    instanceRoot: options.instanceRoot,
    runtime: options.runtime,
    rootDir: '.workflows',
    packageId: options.packageId,
  });
  const manifestPath = options.runtime.resolvePath(rootPath, 'WORKFLOW.md');
  const flowPath = options.runtime.resolvePath(rootPath, 'nous.flow.yaml');
  if (!(await options.runtime.exists(manifestPath))) {
    throw new Error(`Installed workflow package is missing WORKFLOW.md: ${options.packageId}`);
  }
  if (!(await options.runtime.exists(flowPath))) {
    throw new Error(`Installed workflow package is missing nous.flow.yaml: ${options.packageId}`);
  }

  const manifest = await readText(manifestPath);
  const parsedManifest = parseMarkdownFrontmatter(manifest);
  const rawFrontmatter =
    parsedManifest.frontmatter &&
    typeof parsedManifest.frontmatter === 'object' &&
    !Array.isArray(parsedManifest.frontmatter)
      ? (parsedManifest.frontmatter as Record<string, unknown>)
      : {};
  const normalizedManifest = normalizeWorkflowManifest(rawFrontmatter);
  const parsedFlow = parseWorkflowFlowDocument(await readText(flowPath));

  const steps = await Promise.all(
    parsedFlow.flow.steps.map(async (flowStep) => {
      const absoluteStepPath = resolveSafeChildPath(rootPath, flowStep.file);
      if (!(await options.runtime.exists(absoluteStepPath))) {
        throw new Error(`Workflow step file does not exist: ${flowStep.file}`);
      }

      const stepDocument = parseMarkdownFrontmatter(await readText(absoluteStepPath));
      const rawStepFrontmatter =
        stepDocument.frontmatter &&
        typeof stepDocument.frontmatter === 'object' &&
        !Array.isArray(stepDocument.frontmatter)
          ? (stepDocument.frontmatter as Record<string, unknown>)
          : {};
      const frontmatter = WorkflowStepFrontmatterSchema.parse(rawStepFrontmatter);
      if (frontmatter.nous.id !== flowStep.id) {
        throw new Error(
          `Workflow step id mismatch for ${flowStep.file}: expected ${flowStep.id}, received ${frontmatter.nous.id}`,
        );
      }

      return {
        stepId: flowStep.id,
        fileRef: normalizeRelativeRef(flowStep.file),
        frontmatter,
        body: stepDocument.body,
      };
    }),
  );

  return LoadedWorkflowPackageSchema.parse({
    packageId: options.packageId,
    packageVersion: await readInstalledPackageVersion(options.runtime, rootPath),
    rootRef: rootPath,
    manifestRef: manifestPath,
    flowRef: flowPath,
    manifest: normalizedManifest,
    flow: parsedFlow,
    steps,
    ...(await loadResourceRefs(options.runtime, rootPath)),
  });
};

const parseAppManifest = (source: string): AppPackageManifest =>
  AppPackageManifestSchema.parse(JSON.parse(source));

export const loadInstalledAppPackage = async (
  options: LoadInstalledAppPackageOptions,
): Promise<LoadedAppPackage> => {
  const rootPath = await resolvePackagePath({
    instanceRoot: options.instanceRoot,
    runtime: options.runtime,
    rootDir: '.apps',
    packageId: options.packageId,
  });
  const manifestPath = options.runtime.resolvePath(rootPath, 'manifest.json');
  const entrypointPath = options.runtime.resolvePath(rootPath, 'main.ts');
  const lockfilePath = options.runtime.resolvePath(rootPath, 'deno.lock');

  if (!(await options.runtime.exists(manifestPath))) {
    throw new Error(`Installed app package is missing manifest.json: ${options.packageId}`);
  }
  if (!(await options.runtime.exists(entrypointPath))) {
    throw new Error(`Installed app package is missing main.ts: ${options.packageId}`);
  }

  return LoadedAppPackageSchema.parse({
    packageId: options.packageId,
    packageVersion: await readInstalledPackageVersion(options.runtime, rootPath),
    rootRef: rootPath,
    manifestRef: manifestPath,
    manifest: parseAppManifest(await readText(manifestPath)),
    entrypointRef: entrypointPath,
    ...(await options.runtime.exists(lockfilePath)
      ? { lockfileRef: lockfilePath }
      : {}),
    ...(await loadResourceRefs(options.runtime, rootPath)),
  });
};

export interface ListInstalledWorkflowPackagesOptions {
  instanceRoot: string;
  runtime: IRuntime;
}

export const listInstalledWorkflowPackages = async (
  options: ListInstalledWorkflowPackagesOptions,
): Promise<WorkflowLifecycleDefinitionSummary[]> => {
  const packageRoots = await listInstalledPackageRoots({
    instanceRoot: options.instanceRoot,
    runtime: options.runtime,
    rootDir: '.workflows',
  });

  const loadedPackages = await Promise.all(
    packageRoots.map(async (entry) =>
      loadInstalledWorkflowPackage({
        instanceRoot: options.instanceRoot,
        runtime: options.runtime,
        packageId: entry.packageId,
      }),
    ),
  );

  return loadedPackages.map((loadedPackage) =>
    WorkflowLifecycleDefinitionSummarySchema.parse({
      packageId: loadedPackage.packageId,
      packageVersion: loadedPackage.packageVersion,
      name: loadedPackage.manifest.name,
      description: loadedPackage.manifest.description,
      entrypoint: loadedPackage.manifest.entrypoint,
      entrypoints:
        loadedPackage.manifest.entrypoints ?? [loadedPackage.manifest.entrypoint],
      skillDependencies: loadedPackage.manifest.dependencies?.skills ?? [],
      toolDependencies: loadedPackage.manifest.dependencies?.tools ?? [],
      rootRef: loadedPackage.rootRef,
      manifestRef: loadedPackage.manifestRef,
      flowRef: loadedPackage.flowRef,
    }),
  );
};

export interface InspectInstalledWorkflowPackageOptions {
  instanceRoot: string;
  runtime: IRuntime;
  packageId: string;
}

export const inspectInstalledWorkflowPackage = async (
  options: InspectInstalledWorkflowPackageOptions,
): Promise<WorkflowLifecycleInspectResult> => {
  const loadedPackage = await loadInstalledWorkflowPackage({
    instanceRoot: options.instanceRoot,
    runtime: options.runtime,
    packageId: options.packageId,
  });

  return WorkflowLifecycleInspectResultSchema.parse({
    packageId: loadedPackage.packageId,
    packageVersion: loadedPackage.packageVersion,
    manifest: loadedPackage.manifest,
    flow: loadedPackage.flow,
    steps: loadedPackage.steps.map((step) => ({
      stepId: step.stepId,
      fileRef: step.fileRef,
      name: step.frontmatter.name,
      description: step.frontmatter.description,
      type: step.frontmatter.type,
      governance: step.frontmatter.governance,
      executionModel: step.frontmatter.executionModel,
    })),
    resourceRefs: {
      references: loadedPackage.references,
      scripts: loadedPackage.scripts,
      assets: loadedPackage.assets,
    },
  });
};

const buildWorkflowNodeDefinition = (
  workflowDefinitionId: ProjectWorkflowPackageBinding['workflowDefinitionId'],
  step: LoadedWorkflowPackage['steps'][number],
): WorkflowNodeDefinition => {
  const type = step.frontmatter.type ?? step.frontmatter.config?.type;
  return WorkflowNodeDefinitionSchema.parse({
    id: deterministicUuid(`${workflowDefinitionId}:node:${step.stepId}`),
    name: step.frontmatter.name ?? step.stepId,
    description: step.frontmatter.description,
    type,
    governance: step.frontmatter.governance,
    executionModel: step.frontmatter.executionModel,
    inputSchemaRef: step.frontmatter.inputSchemaRef,
    outputSchemaRef: step.frontmatter.outputSchemaRef,
    config: step.frontmatter.config,
  });
};

export interface ResolveInstalledWorkflowDefinitionOptions {
  instanceRoot: string;
  runtime: IRuntime;
  projectConfig: ProjectConfig;
  binding: ProjectWorkflowPackageBinding;
}

export const resolveInstalledWorkflowDefinition = async (
  options: ResolveInstalledWorkflowDefinitionOptions,
): Promise<{
  definition: WorkflowDefinition;
  source: ResolvedWorkflowDefinitionSource;
}> => {
  const binding = ProjectWorkflowPackageBindingSchema.parse(options.binding);
  const loadedPackage = await loadInstalledWorkflowPackage({
    instanceRoot: options.instanceRoot,
    runtime: options.runtime,
    packageId: binding.workflowPackageId,
  });
  const flowDocument = WorkflowFlowDocumentSchema.parse(loadedPackage.flow);
  const entrypoint = binding.entrypoint;
  const availableEntrypoints = loadedPackage.manifest.entrypoints ?? [
    loadedPackage.manifest.entrypoint,
  ];
  if (!availableEntrypoints.includes(entrypoint)) {
    throw new Error(
      `Workflow binding entrypoint ${entrypoint} is not exported by package ${binding.workflowPackageId}`,
    );
  }

  const resolveNodeId = (stepId: string): string =>
    deterministicUuid(`${binding.workflowDefinitionId}:node:${stepId}`);
  const nodes = loadedPackage.steps.map((step) =>
    buildWorkflowNodeDefinition(binding.workflowDefinitionId, step),
  );
  const edges = flowDocument.flow.steps.flatMap((step) =>
    step.next.map((nextEdge) => {
      const target =
        typeof nextEdge === 'string'
          ? { to: nextEdge, priority: 0 }
          : nextEdge;
      return {
        id: deterministicUuid(
          `${binding.workflowDefinitionId}:${step.id}:${target.to}:${target.branchKey ?? ''}:${target.priority ?? 0}`,
        ),
        from: resolveNodeId(step.id),
        to: resolveNodeId(target.to),
        branchKey: target.branchKey,
        priority: target.priority ?? 0,
      };
    }),
  );

  const definition = WorkflowDefinitionSchema.parse({
    id: binding.workflowDefinitionId,
    projectId: options.projectConfig.id,
    mode: 'hybrid',
    version:
      binding.workflowPackageVersion ??
      loadedPackage.packageVersion ??
      '0.0.0',
    name: loadedPackage.manifest.name,
    entryNodeIds: [resolveNodeId(entrypoint)],
    nodes,
    edges,
  });

  return {
    definition,
    source: ResolvedWorkflowDefinitionSourceSchema.parse({
      workflowDefinitionId: binding.workflowDefinitionId,
      sourceKind: 'installed_package',
      packageId: binding.workflowPackageId,
      packageVersion:
        binding.workflowPackageVersion ??
        loadedPackage.packageVersion,
      rootRef: loadedPackage.rootRef,
      manifestRef: loadedPackage.manifestRef,
      bindingRef: `project.workflow.packageBindings:${binding.workflowDefinitionId}`,
    }),
  };
};
