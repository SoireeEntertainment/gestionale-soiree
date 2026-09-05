'use client'

import * as React from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type LoadingButtonProps = ButtonProps & {
  loading?: boolean
  loadingText?: string
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, loadingText, disabled, children, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        className={cn(loading && 'opacity-90', className)}
        {...props}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
              aria-hidden
            />
            {loadingText ?? 'Caricamento…'}
          </span>
        ) : (
          children
        )}
      </Button>
    )
  }
)
LoadingButton.displayName = 'LoadingButton'
