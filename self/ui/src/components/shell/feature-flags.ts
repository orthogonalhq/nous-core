/**
 * Feature flag: Home Sidebar
 *
 * When enabled, the ProjectSwitcherRail shows a home button,
 * the home route swaps the sidebar to a dedicated home sidebar,
 * and the HomeScreen quick actions section is hidden.
 *
 * localStorage key: nous:ff:home-sidebar
 * Default: on (returns true unless explicitly set to 'false')
 */
export function isHomeSidebarEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem('nous:ff:home-sidebar') !== 'false'
  } catch {
    return true
  }
}
