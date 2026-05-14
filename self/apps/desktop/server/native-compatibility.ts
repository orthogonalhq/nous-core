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

export interface NativeCompatibilityCheckResult {
  ok: boolean;
  diagnostic: NativeCompatibilityDiagnostic;
}

const NATIVE_MODULE_NAME = 'better-sqlite3';
const NATIVE_RUNTIME_LABEL = 'PATH node';
const NATIVE_REMEDIATION = `Rebuild or reinstall ${NATIVE_MODULE_NAME} with the PATH node runtime before launching the desktop app.`;

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

export function extractNativeAbiVersions(message: string): Pick<NativeCompatibilityDiagnostic, 'compiledAbi' | 'requiredAbi'> {
  const matches = [...message.matchAll(/NODE_MODULE_VERSION\s+(\d+)/g)].map((match) => match[1]);

  return {
    compiledAbi: matches[0],
    requiredAbi: matches[1],
  };
}

export function createNativeCompatibilityProbeSource(): string {
  return `
const result = {
  moduleName: ${JSON.stringify(NATIVE_MODULE_NAME)},
  runtime: ${JSON.stringify(NATIVE_RUNTIME_LABEL)},
  nodeVersion: process.version,
  nodeAbi: process.versions.modules,
};
try {
  require(${JSON.stringify(NATIVE_MODULE_NAME)});
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.errorCode = error && typeof error === 'object' ? error.code : undefined;
  result.errorMessage = error instanceof Error ? error.message : String(error);
}
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
`;
}

function readStringField(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(field in value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' ? fieldValue : undefined;
}

function readBooleanField(value: unknown, field: string): boolean | undefined {
  if (typeof value !== 'object' || value === null || !(field in value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'boolean' ? fieldValue : undefined;
}

function hasValidSuccessfulProbeShape(result: unknown): boolean {
  return readBooleanField(result, 'ok') === true &&
    readStringField(result, 'moduleName') === NATIVE_MODULE_NAME &&
    readStringField(result, 'runtime') === NATIVE_RUNTIME_LABEL &&
    typeof readStringField(result, 'nodeVersion') === 'string' &&
    typeof readStringField(result, 'nodeAbi') === 'string';
}

export function normalizeNativeCompatibilityResult(
  result: unknown,
  fallback: Partial<NativeCompatibilityDiagnostic> = {},
): NativeCompatibilityCheckResult {
  const requestedOk = readBooleanField(result, 'ok') === true;
  const errorMessage = readStringField(result, 'errorMessage') ?? '';
  const { compiledAbi, requiredAbi } = extractNativeAbiVersions(errorMessage);
  const ok = requestedOk && hasValidSuccessfulProbeShape(result);

  return {
    ok,
    diagnostic: {
      moduleName: NATIVE_MODULE_NAME,
      runtime: NATIVE_RUNTIME_LABEL,
      nodeVersion: readStringField(result, 'nodeVersion') ?? fallback.nodeVersion,
      nodeAbi: readStringField(result, 'nodeAbi') ?? fallback.nodeAbi,
      errorCode: readStringField(result, 'errorCode') ?? fallback.errorCode ?? (requestedOk && !ok ? 'INVALID_PROBE_OUTPUT' : undefined),
      compiledAbi,
      requiredAbi,
      remediation: fallback.remediation ?? (requestedOk && !ok
        ? 'The better-sqlite3 compatibility check produced an invalid success result and was rejected before launching the desktop backend.'
        : NATIVE_REMEDIATION),
    },
  };
}

export function normalizeInvalidNativeCompatibilityCheck(
  errorCode: string,
  remediation: string,
): NativeCompatibilityCheckResult {
  return {
    ok: false,
    diagnostic: {
      moduleName: NATIVE_MODULE_NAME,
      runtime: NATIVE_RUNTIME_LABEL,
      errorCode,
      remediation,
    },
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
    moduleName: NATIVE_MODULE_NAME,
    runtime: NATIVE_RUNTIME_LABEL,
    nodeVersion: process.version,
    nodeAbi: process.versions.modules,
    errorCode,
    compiledAbi,
    requiredAbi,
    remediation: NATIVE_REMEDIATION,
  };
}

export function formatNativeCompatibilityFailure(diagnostic: NativeCompatibilityDiagnostic): string {
  return [
    `[nous:desktop] native compatibility check failed for ${diagnostic.moduleName}`,
    `runtime=${diagnostic.runtime}`,
    diagnostic.nodeVersion ? `node=${diagnostic.nodeVersion}` : undefined,
    diagnostic.nodeAbi ? `abi=${diagnostic.nodeAbi}` : undefined,
    diagnostic.errorCode ? `errorCode=${diagnostic.errorCode}` : undefined,
    diagnostic.compiledAbi ? `compiledAbi=${diagnostic.compiledAbi}` : undefined,
    diagnostic.requiredAbi ? `requiredAbi=${diagnostic.requiredAbi}` : undefined,
    diagnostic.remediation,
  ].filter(Boolean).join('\n');
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
