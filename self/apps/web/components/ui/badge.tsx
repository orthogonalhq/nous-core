import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', style, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--nous-radius-md)',
      padding: '2px 10px',
      fontSize: 'var(--nous-font-size-xs)',
      fontWeight: 'var(--nous-font-weight-medium)',
    };
    const variantStyles: Record<NonNullable<BadgeProps['variant']>, React.CSSProperties> = {
      default: {
        background: 'var(--nous-accent)',
        color: 'var(--nous-fg-on-color)',
      },
      secondary: {
        background: 'var(--nous-bg-hover)',
        color: 'var(--nous-text-secondary)',
      },
      outline: {
        border: '1px solid var(--nous-shell-column-border)',
        color: 'var(--nous-text-primary)',
      },
    };
    return (
      <span
        ref={ref}
        className={className}
        style={{
          ...baseStyle,
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      />
    );
  },
);
Badge.displayName = 'Badge';

export { Badge };
