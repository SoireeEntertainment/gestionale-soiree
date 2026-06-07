'use client'

import { useCallback, useRef } from 'react'
import { measureAction } from '@/lib/measure-action'
import { showToast } from '@/lib/toast'

type OptimisticActionOptions<T> = {
  name?: string
  apply: () => void
  rollback: () => void
  action: () => Promise<T>
  onSuccess?: (result: T) => void
  onError?: (error: unknown) => void
  pendingMessage?: string
  successMessage?: string
  errorMessage?: string
  silent?: boolean
}

export function useOptimisticAction() {
  const inFlightRef = useRef(0)

  const run = useCallback(async <T>(opts: OptimisticActionOptions<T>): Promise<T | null> => {
    inFlightRef.current += 1
    if (opts.pendingMessage && !opts.silent) {
      showToast(opts.pendingMessage, 'loading')
    }
    opts.apply()

    try {
      const result = opts.name
        ? await measureAction(opts.name, opts.action)
        : await opts.action()
      if (opts.successMessage && !opts.silent) {
        showToast(opts.successMessage, 'success')
      }
      opts.onSuccess?.(result)
      return result
    } catch (error) {
      opts.rollback()
      const msg =
        opts.errorMessage ??
        (error instanceof Error ? error.message : 'Operazione non riuscita')
      if (!opts.silent) showToast(msg, 'error')
      opts.onError?.(error)
      return null
    } finally {
      inFlightRef.current -= 1
    }
  }, [])

  return { run, isBusy: () => inFlightRef.current > 0 }
}
