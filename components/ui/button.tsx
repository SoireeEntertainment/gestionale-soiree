import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'default' | 'lg'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'rounded-md font-medium transition-colors',
          size === 'sm' && 'px-2 py-1 text-sm',
          size === 'default' && 'px-4 py-2',
          size === 'lg' && 'px-6 py-3 text-lg',
          variant === 'primary' && 'bg-accent text-dark hover:bg-accent/90',
          variant === 'secondary' && 'bg-transparent border border-accent text-accent hover:bg-accent/10',
          variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600',
          variant === 'ghost' && 'text-white/70 hover:text-white hover:bg-white/5',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }

