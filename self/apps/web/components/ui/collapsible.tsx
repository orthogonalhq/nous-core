'use client';

import * as React from 'react';

interface CollapsibleContextValue {
  open: boolean;
  onToggle: () => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

export function Collapsible({
  children,
  defaultOpen = false,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const value = React.useMemo(
    () => ({ open, onToggle: () => setOpen((o) => !o) }),
    [open],
  );
  return (
    <CollapsibleContext.Provider value={value}>
      {children}
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.onToggle}
      className={className}
      {...props}
    >
      {children}
      <span className="ml-1">{ctx.open ? '▼' : '▶'}</span>
    </button>
  );
}

export function CollapsibleContent({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) return null;
  if (!ctx.open) return null;
  return <div className={className}>{children}</div>;
}
