import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium';
    const variants = {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-muted text-muted-foreground',
      outline: 'border border-border',
    };
    return (
      <span
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);
Badge.displayName = 'Badge';

export { Badge };
