'use client'

import { useToastStore, type ToastType } from '@/lib/stores/toast-store'

export type { ToastType }

export function showToast(message: string, type: 'success' | 'error' | 'info' | 'loading' = 'success') {
  return useToastStore.getState().addToast(message, type)
}

export function dismissToast(id: string) {
  useToastStore.getState().dismissToast(id)
}
