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

describe('desktop hardware and first-run IPC contract', () => {
  it('registers the hardware IPC channels in preload and main', () => {
    expect(preloadSource).toContain('hardware:getSpec');
    expect(preloadSource).toContain('hardware:getRecommendations');
    expect(mainSource).toContain("ipcMain.handle('hardware:getSpec'");
    expect(mainSource).toContain("ipcMain.handle('hardware:getRecommendations'");
  });

  it('registers the first-run IPC channels in preload and main', () => {
    expect(preloadSource).toContain('firstRun:getWizardState');
    expect(preloadSource).toContain('firstRun:checkPrerequisites');
    expect(preloadSource).toContain('firstRun:downloadModel');
    expect(preloadSource).toContain('firstRun:configureProvider');
    expect(preloadSource).toContain('firstRun:assignRoles');
    expect(preloadSource).toContain('firstRun:completeStep');
    expect(preloadSource).toContain('firstRun:resetWizard');

    expect(mainSource).toContain("ipcMain.handle('firstRun:getWizardState'");
    expect(mainSource).toContain("ipcMain.handle('firstRun:checkPrerequisites'");
    expect(mainSource).toContain("ipcMain.handle('firstRun:downloadModel'");
    expect(mainSource).toContain("ipcMain.handle('firstRun:configureProvider'");
    expect(mainSource).toContain("ipcMain.handle('firstRun:assignRoles'");
    expect(mainSource).toContain("ipcMain.handle('firstRun:completeStep'");
    expect(mainSource).toContain("ipcMain.handle('firstRun:resetWizard'");
  });

  it('exposes the hardware and first-run namespaces in the renderer env contract', () => {
    expect(envSource).toContain('hardware: {');
    expect(envSource).toContain('getSpec: () => Promise<HardwareSpec>');
    expect(envSource).toContain('getRecommendations: () => Promise<RecommendationResult>');
    expect(envSource).toContain('firstRun: {');
    expect(envSource).toContain('getWizardState: () => Promise<FirstRunState>');
    expect(envSource).toContain('checkPrerequisites: () => Promise<FirstRunPrerequisites>');
    expect(envSource).toContain('downloadModel: (model: string) => Promise<FirstRunActionResult>');
    expect(envSource).toContain('configureProvider: (modelSpec: string) => Promise<FirstRunActionResult>');
    expect(envSource).toContain('assignRoles: (assignments: FirstRunRoleAssignmentInput[]) => Promise<FirstRunActionResult>');
    expect(envSource).toContain('completeStep: (step: FirstRunStep) => Promise<FirstRunState>');
    expect(envSource).toContain('resetWizard: () => Promise<FirstRunState>');
  });
});
