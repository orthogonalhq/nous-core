import * as React from 'react';

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      borderRadius: 'var(--nous-radius-lg)',
      border: '1px solid var(--nous-shell-column-border)',
      background: 'var(--nous-bg-surface)',
      ...style,
    }}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: 'var(--nous-space-md)',
      ...style,
    }}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className = '', style, ...props }, ref) => (
  <h3
    ref={ref}
    className={className}
    style={{
      fontSize: 'var(--nous-font-size-lg)',
      fontWeight: 'var(--nous-font-weight-semibold)',
      lineHeight: 1,
      letterSpacing: '-0.01em',
      ...style,
    }}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', style, ...props }, ref) => (
  <div
    ref={ref}
    className={className}
    style={{
      padding: '0 var(--nous-space-md) var(--nous-space-md)',
      ...style,
    }}
    {...props}
  />
));
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
