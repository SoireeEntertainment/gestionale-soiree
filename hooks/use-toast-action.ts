'use client'

import { useCallback } from 'react'
import { measureAction } from '@/lib/measure-action'
import { showToast } from '@/lib/toast'

type ToastActionOptions<T> = {
  name?: string
  action: () => Promise<T>
  pendingMessage?: string
  successMessage?: string
  errorMessage?: string
  onSuccess?: (result: T) => void
  onError?: (error: unknown) => void
}

export function useToastAction() {
  const run = useCallback(async <T>(opts: ToastActionOptions<T>): Promise<T | null> => {
    if (opts.pendingMessage) showToast(opts.pendingMessage, 'loading')
    try {
      const result = opts.name
        ? await measureAction(opts.name, opts.action)
        : await opts.action()
      if (opts.successMessage) showToast(opts.successMessage, 'success')
      opts.onSuccess?.(result)
      return result
    } catch (error) {
      const msg =
        opts.errorMessage ??
        (error instanceof Error ? error.message : 'Operazione non riuscita')
      showToast(msg, 'error')
      opts.onError?.(error)
      return null
    }
  }, [])

  return { run }
}
