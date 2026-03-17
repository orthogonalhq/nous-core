import {
  AppPanelRegistrationProjectionSchema,
  type AppPanelRegistrationProjection,
} from '@nous/shared';

export class PanelRegistrationRegistry {
  private readonly panelsBySession = new Map<string, AppPanelRegistrationProjection[]>();

  registerPanels(
    sessionId: string,
    panels: readonly AppPanelRegistrationProjection[],
  ): AppPanelRegistrationProjection[] {
    const parsed = panels.map((panel) =>
      AppPanelRegistrationProjectionSchema.parse(panel),
    );
    this.panelsBySession.set(sessionId, parsed);
    return parsed;
  }

  listSessionPanels(sessionId: string): AppPanelRegistrationProjection[] {
    return this.panelsBySession.get(sessionId) ?? [];
  }

  unregisterSession(sessionId: string): AppPanelRegistrationProjection[] {
    const panels = this.panelsBySession.get(sessionId) ?? [];
    this.panelsBySession.delete(sessionId);
    return panels;
  }
}
