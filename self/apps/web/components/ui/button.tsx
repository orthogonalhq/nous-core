import * as React from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className = '',
    variant = 'default',
    size = 'default',
    type = 'button',
    style,
    disabled,
    ...props
  }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--nous-radius-md)',
      fontSize: 'var(--nous-font-size-sm)',
      fontWeight: 'var(--nous-font-weight-medium)',
      transition: 'color 0.15s, background-color 0.15s',
      outline: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
    };
    const sizeStyles: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
      default: {
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
      },
      sm: {
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
      },
    };
    const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
      default: {
        border: 'none',
        background: 'var(--nous-accent)',
        color: 'var(--nous-fg-on-color)',
      },
      outline: {
        border: '1px solid var(--nous-shell-column-border)',
        background: 'transparent',
        color: 'var(--nous-text-primary)',
      },
      ghost: {
        border: 'none',
        background: 'transparent',
        color: 'var(--nous-text-primary)',
      },
    };
    return (
      <button
        ref={ref}
        type={type}
        className={className}
        disabled={disabled}
        style={{
          ...baseStyle,
          ...sizeStyles[size],
          ...variantStyles[variant],
          ...(disabled
            ? {
                pointerEvents: 'none',
                opacity: 0.5,
              }
            : {}),
          ...style,
        }}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
