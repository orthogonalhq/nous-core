'use client'

import * as React from 'react'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, disabled, ...props }, ref) => (
    <input
      type={type}
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
        transition: 'color 0.15s, border-color 0.15s',
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
    />
  ),
)
Input.displayName = 'Input'

export { Input }
