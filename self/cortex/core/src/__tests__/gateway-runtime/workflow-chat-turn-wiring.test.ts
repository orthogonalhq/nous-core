import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cortexRuntimeSrc = fs.readFileSync(
  path.resolve(__dirname, '../../gateway-runtime/cortex-runtime.ts'),
  'utf-8',
);

const principalSystemRuntimeSrc = fs.readFileSync(
  path.resolve(__dirname, '../../gateway-runtime/principal-system-runtime.ts'),
  'utf-8',
);

describe('handleChatTurn task instruction wiring — WORKFLOW_PROMPT_FRAGMENT', () => {
  // ── Tier 2: Behavior Tests ─────────────────────────────────────────────

  it('cortex-runtime.ts imports WORKFLOW_PROMPT_FRAGMENT', () => {
    expect(cortexRuntimeSrc).toContain("import { WORKFLOW_PROMPT_FRAGMENT } from './workflow-prompt-fragment.js'");
  });

  it('cortex-runtime.ts handleChatTurn taskInstructions includes WORKFLOW_PROMPT_FRAGMENT in template literal', () => {
    expect(cortexRuntimeSrc).toContain('${WORKFLOW_PROMPT_FRAGMENT}');
  });

  it('principal-system-runtime.ts imports WORKFLOW_PROMPT_FRAGMENT', () => {
    expect(principalSystemRuntimeSrc).toContain("import { WORKFLOW_PROMPT_FRAGMENT } from './workflow-prompt-fragment.js'");
  });

  it('principal-system-runtime.ts handleChatTurn taskInstructions includes WORKFLOW_PROMPT_FRAGMENT in template literal', () => {
    expect(principalSystemRuntimeSrc).toContain('${WORKFLOW_PROMPT_FRAGMENT}');
  });

  it('both files use the same fragment constant (consistency check)', () => {
    const cortexImportMatch = cortexRuntimeSrc.match(
      /import\s*\{\s*WORKFLOW_PROMPT_FRAGMENT\s*\}\s*from\s*'([^']+)'/,
    );
    const principalImportMatch = principalSystemRuntimeSrc.match(
      /import\s*\{\s*WORKFLOW_PROMPT_FRAGMENT\s*\}\s*from\s*'([^']+)'/,
    );

    expect(cortexImportMatch).not.toBeNull();
    expect(principalImportMatch).not.toBeNull();
    expect(cortexImportMatch![1]).toBe(principalImportMatch![1]);
  });
});
