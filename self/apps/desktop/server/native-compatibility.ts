export interface NativeCompatibilityDiagnostic {
  moduleName: 'better-sqlite3';
  runtime: 'PATH node';
  nodeVersion?: string;
  nodeAbi?: string;
  errorCode?: string;
  compiledAbi?: string;
  requiredAbi?: string;
  remediation: string;
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }

  return undefined;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractNativeAbiVersions(message: string): Pick<NativeCompatibilityDiagnostic, 'compiledAbi' | 'requiredAbi'> {
  const matches = [...message.matchAll(/NODE_MODULE_VERSION\s+(\d+)/g)].map((match) => match[1]);

  return {
    compiledAbi: matches[0],
    requiredAbi: matches[1],
  };
}

export function getNativeCompatibilityDiagnostic(error: unknown): NativeCompatibilityDiagnostic | null {
  const errorCode = readErrorCode(error);
  const message = readErrorMessage(error);

  if (errorCode !== 'ERR_DLOPEN_FAILED') {
    return null;
  }

  if (!message.includes('better-sqlite3') && !message.includes('better_sqlite3.node')) {
    return null;
  }

  const { compiledAbi, requiredAbi } = extractNativeAbiVersions(message);

  return {
    moduleName: 'better-sqlite3',
    runtime: 'PATH node',
    nodeVersion: process.version,
    nodeAbi: process.versions.modules,
    errorCode,
    compiledAbi,
    requiredAbi,
    remediation: 'Rebuild or reinstall better-sqlite3 with the PATH node runtime before launching the desktop app.',
  };
}

export function formatNativeCompatibilityDiagnostic(diagnostic: NativeCompatibilityDiagnostic): string {
  return [
    `[nous:desktop-server] native compatibility diagnostic: module=${diagnostic.moduleName}`,
    `runtime=${diagnostic.runtime}`,
    diagnostic.nodeVersion ? `node=${diagnostic.nodeVersion}` : undefined,
    diagnostic.nodeAbi ? `abi=${diagnostic.nodeAbi}` : undefined,
    diagnostic.errorCode ? `errorCode=${diagnostic.errorCode}` : undefined,
    diagnostic.compiledAbi ? `compiledAbi=${diagnostic.compiledAbi}` : undefined,
    diagnostic.requiredAbi ? `requiredAbi=${diagnostic.requiredAbi}` : undefined,
    diagnostic.remediation,
  ].filter(Boolean).join('\n');
}
