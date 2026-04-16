import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const preloadSource = readFileSync(
  join(__dirname, '..', 'src', 'preload', 'index.ts'),
  'utf-8',
);
const mainSource = readFileSync(
  join(__dirname, '..', 'src', 'main', 'index.ts'),
  'utf-8',
);
const envSource = readFileSync(
  join(__dirname, '..', 'src', 'renderer', 'src', 'env.d.ts'),
  'utf-8',
);

describe('desktop preferences role assignment IPC contract', () => {
  it('registers the role assignment preferences IPC channels in preload and main', () => {
    expect(preloadSource).toContain('preferences:getRoleAssignments');
    expect(preloadSource).toContain('preferences:setRoleAssignment');
    expect(mainSource).toContain("ipcMain.handle('preferences:getRoleAssignments'");
    expect(mainSource).toContain("ipcMain.handle('preferences:setRoleAssignment'");
  });

  it('exposes the preferences namespace in the renderer env contract', () => {
    expect(envSource).toContain('preferences: {');
    expect(envSource).toContain('getApiKeys: () => Promise<PreferencesApiKeyEntry[]>');
    expect(envSource).toContain('getAvailableModels: () => Promise<{ models: PreferencesAvailableModel[] }>');
    expect(envSource).toContain('getRoleAssignments: () => Promise<RoleAssignmentDisplayEntry[]>');
    expect(envSource).toContain(
      'setRoleAssignment: (input: { role: string; modelSpec: string }) => Promise<{ success: boolean; error?: string }>',
    );
  });
});
