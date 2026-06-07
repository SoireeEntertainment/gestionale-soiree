'use client'

import { useCallback, useState } from 'react'

export function usePendingState(initial = false) {
  const [pending, setPending] = useState(initial)

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (pending) return undefined
    setPending(true)
    try {
      return await fn()
    } finally {
      setPending(false)
    }
  }, [pending])

  return { pending, setPending, run }
}
