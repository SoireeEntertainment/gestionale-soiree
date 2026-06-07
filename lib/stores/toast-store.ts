'use client'

import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export type ToastItem = {
  id: string
  message: string
  type: ToastType
  createdAt: number
}

type ToastState = {
  toasts: ToastItem[]
  addToast: (message: string, type?: ToastType) => string
  dismissToast: (id: string) => void
}

let toastCounter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = `toast-${++toastCounter}-${Date.now()}`
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { id, message, type, createdAt: Date.now() }],
    }))
    return id
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
