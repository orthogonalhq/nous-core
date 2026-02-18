/**
 * Navigation config — extensible for future package surfaces.
 */
export interface NavItem {
  href: string;
  label: string;
  icon?: string;
  external?: boolean;
}

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:3001';

export const NAV_CONFIG: { items: NavItem[] } = {
  items: [
    { href: '/chat', label: 'Chat' },
    { href: '/traces', label: 'Traces' },
    { href: '/memory', label: 'Memory' },
    { href: '/config', label: 'Configuration' },
    { href: DOCS_URL, label: 'Documentation', external: true },
  ],
};
