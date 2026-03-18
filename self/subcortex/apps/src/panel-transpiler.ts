import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ResolvedAppPanelDescriptor } from './panel-registration.js';

const execFileAsync = promisify(execFile);
const SUPPORTED_PANEL_ENTRY_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
]);

interface PersistedPanelTranspileCacheRecord {
  cache_key: string;
  app_id: string;
  panel_id: string;
  session_id: string;
  package_version: string;
  normalized_entry_path: string;
  descriptor_fingerprint: string;
  source_fingerprint: string;
  generated_at: string;
}

export interface PanelTranspileCacheEntry extends PersistedPanelTranspileCacheRecord {
  bundle_js: string;
  bundle_path: string;
  metadata_path: string;
}

export interface PanelTranspileResult {
  cache_status: 'hit' | 'miss';
  entry: PanelTranspileCacheEntry;
}

export interface PanelTranspilerOptions {
  command?: string;
  now?: () => string;
  access?: typeof access;
  mkdir?: typeof mkdir;
  readFile?: typeof readFile;
  rm?: typeof rm;
  writeFile?: typeof writeFile;
  bundle?: (input: {
    command: string;
    entryPath: string;
    packageRoot: string;
  }) => Promise<string>;
}

interface PanelSourceState {
  cacheKey: string;
  descriptorFingerprint: string;
  normalizedEntryPath: string;
  resolvedEntryPath: string;
  sourceFingerprint: string;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildPanelIdentityKey(panel: Pick<ResolvedAppPanelDescriptor, 'app_id' | 'panel_id'>): string {
  return `${panel.app_id}::${panel.panel_id}`;
}

function defaultBundle(input: {
  command: string;
  entryPath: string;
  packageRoot: string;
}): Promise<string> {
  return execFileAsync(input.command, ['bundle', input.entryPath], {
    cwd: input.packageRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }).then((result) => result.stdout);
}

export class PanelTranspiler {
  private readonly command: string;
  private readonly now: () => string;
  private readonly accessFile: typeof access;
  private readonly ensureDir: typeof mkdir;
  private readonly readTextFile: typeof readFile;
  private readonly removePath: typeof rm;
  private readonly writeTextFile: typeof writeFile;
  private readonly bundle: NonNullable<PanelTranspilerOptions['bundle']>;
  private readonly inflightByCacheKey = new Map<string, Promise<PanelTranspileResult>>();
  private readonly cacheKeysByPanel = new Map<string, Set<string>>();
  private readonly cacheKeysBySession = new Map<string, Set<string>>();
  private readonly cachePathsByKey = new Map<
    string,
    {
      bundlePath: string;
      metadataPath: string;
      panelKey: string;
      sessionId: string;
    }
  >();

  constructor(options: PanelTranspilerOptions = {}) {
    this.command = options.command ?? 'deno';
    this.now = options.now ?? (() => new Date().toISOString());
    this.accessFile = options.access ?? access;
    this.ensureDir = options.mkdir ?? mkdir;
    this.readTextFile = options.readFile ?? readFile;
    this.removePath = options.rm ?? rm;
    this.writeTextFile = options.writeFile ?? writeFile;
    this.bundle = options.bundle ?? defaultBundle;
  }

  async getTranspiledPanel(
    panel: ResolvedAppPanelDescriptor,
  ): Promise<PanelTranspileResult> {
    const sourceState = await this.buildSourceState(panel);
    const cached = await this.readCacheEntry(panel, sourceState);
    if (cached) {
      this.trackCacheOwnership(cached.cache_key, {
        bundlePath: cached.bundle_path,
        metadataPath: cached.metadata_path,
        panelKey: buildPanelIdentityKey(panel),
        sessionId: panel.session_id,
      });
      return {
        cache_status: 'hit',
        entry: cached,
      };
    }

    const inflight = this.inflightByCacheKey.get(sourceState.cacheKey);
    if (inflight) {
      return inflight;
    }

    const pending = this.transpileAndCache(panel, sourceState);
    this.inflightByCacheKey.set(sourceState.cacheKey, pending);

    try {
      return await pending;
    } finally {
      this.inflightByCacheKey.delete(sourceState.cacheKey);
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const cacheKeys = [...(this.cacheKeysBySession.get(sessionId) ?? [])];
    await Promise.all(cacheKeys.map((cacheKey) => this.deleteCacheKey(cacheKey)));
    this.cacheKeysBySession.delete(sessionId);
  }

  private async transpileAndCache(
    panel: ResolvedAppPanelDescriptor,
    sourceState: PanelSourceState,
  ): Promise<PanelTranspileResult> {
    const cachePaths = this.buildCachePaths(panel.package_root_ref, sourceState.cacheKey);
    await this.ensureDir(cachePaths.cacheDir, { recursive: true });

    const bundleJs = await this.bundle({
      command: this.command,
      entryPath: sourceState.resolvedEntryPath,
      packageRoot: panel.package_root_ref,
    });

    const record: PersistedPanelTranspileCacheRecord = {
      cache_key: sourceState.cacheKey,
      app_id: panel.app_id,
      panel_id: panel.panel_id,
      session_id: panel.session_id,
      package_version: panel.package_version,
      normalized_entry_path: sourceState.normalizedEntryPath,
      descriptor_fingerprint: sourceState.descriptorFingerprint,
      source_fingerprint: sourceState.sourceFingerprint,
      generated_at: this.now(),
    };

    await this.writeTextFile(cachePaths.bundlePath, bundleJs, 'utf8');
    await this.writeTextFile(
      cachePaths.metadataPath,
      JSON.stringify(record, null, 2),
      'utf8',
    );

    this.trackCacheOwnership(sourceState.cacheKey, {
      bundlePath: cachePaths.bundlePath,
      metadataPath: cachePaths.metadataPath,
      panelKey: buildPanelIdentityKey(panel),
      sessionId: panel.session_id,
    });
    await this.pruneStalePanelCaches(buildPanelIdentityKey(panel), sourceState.cacheKey);

    return {
      cache_status: 'miss',
      entry: {
        ...record,
        bundle_js: bundleJs,
        bundle_path: cachePaths.bundlePath,
        metadata_path: cachePaths.metadataPath,
      },
    };
  }

  private async readCacheEntry(
    panel: ResolvedAppPanelDescriptor,
    sourceState: PanelSourceState,
  ): Promise<PanelTranspileCacheEntry | null> {
    const cachePaths = this.buildCachePaths(panel.package_root_ref, sourceState.cacheKey);
    try {
      await this.accessFile(cachePaths.bundlePath);
      await this.accessFile(cachePaths.metadataPath);
      const [bundleJs, metadataRaw] = await Promise.all([
        this.readTextFile(cachePaths.bundlePath, 'utf8'),
        this.readTextFile(cachePaths.metadataPath, 'utf8'),
      ]);
      const metadata = JSON.parse(metadataRaw) as Partial<PersistedPanelTranspileCacheRecord>;
      if (
        metadata.cache_key !== sourceState.cacheKey ||
        metadata.app_id !== panel.app_id ||
        metadata.panel_id !== panel.panel_id ||
        metadata.session_id !== panel.session_id ||
        metadata.package_version !== panel.package_version ||
        metadata.normalized_entry_path !== sourceState.normalizedEntryPath ||
        metadata.descriptor_fingerprint !== sourceState.descriptorFingerprint ||
        metadata.source_fingerprint !== sourceState.sourceFingerprint ||
        typeof metadata.generated_at !== 'string'
      ) {
        return null;
      }

      const record: PersistedPanelTranspileCacheRecord = {
        cache_key: metadata.cache_key,
        app_id: metadata.app_id,
        panel_id: metadata.panel_id,
        session_id: metadata.session_id,
        package_version: metadata.package_version,
        normalized_entry_path: metadata.normalized_entry_path,
        descriptor_fingerprint: metadata.descriptor_fingerprint,
        source_fingerprint: metadata.source_fingerprint,
        generated_at: metadata.generated_at,
      };

      return {
        ...record,
        bundle_js: bundleJs,
        bundle_path: cachePaths.bundlePath,
        metadata_path: cachePaths.metadataPath,
      };
    } catch {
      return null;
    }
  }

  private async buildSourceState(
    panel: ResolvedAppPanelDescriptor,
  ): Promise<PanelSourceState> {
    const resolvedEntryPath = this.resolvePanelEntryPath(panel);
    const sourceContent = await this.readTextFile(resolvedEntryPath, 'utf8');
    const normalizedEntryPath = relative(
      panel.package_root_ref,
      resolvedEntryPath,
    ).replace(/\\/g, '/');
    const descriptorFingerprint = hashValue(
      JSON.stringify({
        app_id: panel.app_id,
        panel_id: panel.panel_id,
        entry: normalizedEntryPath,
        label: panel.label,
        position: panel.position ?? null,
        preserve_state: panel.preserve_state,
        package_version: panel.package_version,
      }),
    );
    const sourceFingerprint = hashValue(sourceContent);
    const cacheKey = hashValue(
      JSON.stringify({
        app_id: panel.app_id,
        panel_id: panel.panel_id,
        package_version: panel.package_version,
        entry: normalizedEntryPath,
        descriptor_fingerprint: descriptorFingerprint,
        source_fingerprint: sourceFingerprint,
      }),
    );

    return {
      cacheKey,
      descriptorFingerprint,
      normalizedEntryPath,
      resolvedEntryPath,
      sourceFingerprint,
    };
  }

  private resolvePanelEntryPath(panel: ResolvedAppPanelDescriptor): string {
    if (panel.entry.trim() === '') {
      throw new Error(
        `Panel ${panel.app_id}/${panel.panel_id} is missing an entrypoint`,
      );
    }

    const resolvedPackageRoot = resolve(panel.package_root_ref);
    const resolvedEntryPath = resolve(resolvedPackageRoot, panel.entry);
    const relativePath = relative(resolvedPackageRoot, resolvedEntryPath);

    if (
      relativePath.startsWith('..') ||
      relativePath === '' ||
      relativePath.includes('..\\') ||
      relativePath.includes('../')
    ) {
      throw new Error(
        `Panel ${panel.app_id}/${panel.panel_id} entry escapes the package root`,
      );
    }

    if (!SUPPORTED_PANEL_ENTRY_EXTENSIONS.has(extname(resolvedEntryPath))) {
      throw new Error(
        `Panel ${panel.app_id}/${panel.panel_id} entry must be a TS, TSX, or JS module`,
      );
    }

    return resolvedEntryPath;
  }

  private buildCachePaths(packageRoot: string, cacheKey: string): {
    cacheDir: string;
    bundlePath: string;
    metadataPath: string;
  } {
    const cacheDir = join(packageRoot, '.panel-cache');
    return {
      cacheDir,
      bundlePath: join(cacheDir, `${cacheKey}.js`),
      metadataPath: join(cacheDir, `${cacheKey}.json`),
    };
  }

  private trackCacheOwnership(
    cacheKey: string,
    input: {
      bundlePath: string;
      metadataPath: string;
      panelKey: string;
      sessionId: string;
    },
  ): void {
    this.cachePathsByKey.set(cacheKey, input);

    const panelCacheKeys = this.cacheKeysByPanel.get(input.panelKey) ?? new Set<string>();
    panelCacheKeys.add(cacheKey);
    this.cacheKeysByPanel.set(input.panelKey, panelCacheKeys);

    const sessionCacheKeys =
      this.cacheKeysBySession.get(input.sessionId) ?? new Set<string>();
    sessionCacheKeys.add(cacheKey);
    this.cacheKeysBySession.set(input.sessionId, sessionCacheKeys);
  }

  private async pruneStalePanelCaches(
    panelKey: string,
    keepCacheKey: string,
  ): Promise<void> {
    const cacheKeys = [...(this.cacheKeysByPanel.get(panelKey) ?? [])];
    const staleCacheKeys = cacheKeys.filter((cacheKey) => cacheKey !== keepCacheKey);
    await Promise.all(staleCacheKeys.map((cacheKey) => this.deleteCacheKey(cacheKey)));
  }

  private async deleteCacheKey(cacheKey: string): Promise<void> {
    const cachePaths = this.cachePathsByKey.get(cacheKey);
    if (!cachePaths) {
      return;
    }

    await Promise.all([
      this.removePath(cachePaths.bundlePath, { force: true }),
      this.removePath(cachePaths.metadataPath, { force: true }),
    ]);

    const panelCacheKeys = this.cacheKeysByPanel.get(cachePaths.panelKey);
    panelCacheKeys?.delete(cacheKey);
    if (panelCacheKeys?.size === 0) {
      this.cacheKeysByPanel.delete(cachePaths.panelKey);
    }

    const sessionCacheKeys = this.cacheKeysBySession.get(cachePaths.sessionId);
    sessionCacheKeys?.delete(cacheKey);
    if (sessionCacheKeys?.size === 0) {
      this.cacheKeysBySession.delete(cachePaths.sessionId);
    }

    this.cachePathsByKey.delete(cacheKey);
  }
}
