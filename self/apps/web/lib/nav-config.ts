/**
 * Navigation config — extensible for future package surfaces.
 */
export interface NavItem {
  href: string;
  label: string;
  icon?: string;
}

export const NAV_CONFIG: { items: NavItem[] } = {
  items: [
    { href: '/chat', label: 'Chat' },
    { href: '/traces', label: 'Traces' },
    { href: '/memory', label: 'Memory' },
    { href: '/config', label: 'Configuration' },
  ],
};
