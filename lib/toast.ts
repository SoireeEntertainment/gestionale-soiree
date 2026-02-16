'use client'

import * as Toast from '@radix-ui/react-toast'

let toastId = 0

export function showToast(message: string, type: 'success' | 'error' = 'success') {
  // This will be implemented with a toast context
  console.log(`[${type.toUpperCase()}] ${message}`)
}

