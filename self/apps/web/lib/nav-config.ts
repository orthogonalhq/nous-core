/**
 * Navigation config — extensible for future package surfaces.
 */
export interface NavItem {
  href: string;
  label: string;
  icon?: string;
  external?: boolean;
  railId?: string;
}

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:4318';

export const NAV_CONFIG: { items: NavItem[] } = {
  items: [
    { href: '/chat', label: 'Chat', railId: 'chat' },
    { href: '/projects', label: 'Projects', railId: 'projects' },
    { href: '/mobile', label: 'Mobile', railId: 'mobile' },
    { href: '/marketplace', label: 'Marketplace', railId: 'marketplace' },
    { href: '/traces', label: 'Traces', railId: 'traces' },
    { href: '/memory', label: 'Memory', railId: 'memory' },
    { href: '/config', label: 'Configuration', railId: 'config' },
    { href: DOCS_URL, label: 'Documentation', external: true },
  ],
};
