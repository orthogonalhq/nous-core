import * as React from 'react';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', children, style, disabled, ...props }, ref) => (
    <select
      ref={ref}
      className={className}
      disabled={disabled}
      style={{
        display: 'flex',
        height: '36px',
        width: '100%',
        borderRadius: 'var(--nous-radius-md)',
        border: '1px solid var(--nous-shell-column-border)',
        background: 'transparent',
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
        fontSize: 'var(--nous-font-size-sm)',
        boxShadow: 'var(--nous-shadow-sm)',
        outline: 'none',
        ...(disabled
          ? {
              cursor: 'not-allowed',
              opacity: 0.5,
            }
          : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export { Select };
