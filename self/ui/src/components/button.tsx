'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
    const sizes = {
      default: 'px-4 py-2',
      sm: 'px-2 py-1',
    }
    const variants = {
      default: 'bg-primary text-primary-foreground hover:opacity-90',
      outline: 'border border-border bg-transparent hover:bg-muted',
      ghost: 'hover:bg-muted',
    }
    return (
      <button
        ref={ref}
        type={type}
        className={cn(base, sizes[size], variants[variant], className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button }
