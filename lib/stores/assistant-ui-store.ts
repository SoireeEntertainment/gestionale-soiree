import { create } from 'zustand'

type AssistantUiState = {
  isOpen: boolean
  activeThreadId: string | null
  inputDraft: string
  openAssistant: () => void
  closeAssistant: () => void
  toggleAssistant: () => void
  setActiveThread: (id: string | null) => void
  setInputDraft: (value: string) => void
}

export const useAssistantUiStore = create<AssistantUiState>((set) => ({
  isOpen: false,
  activeThreadId: null,
  inputDraft: '',
  openAssistant: () => set({ isOpen: true }),
  closeAssistant: () => set({ isOpen: false }),
  toggleAssistant: () => set((s) => ({ isOpen: !s.isOpen })),
  setActiveThread: (id) => set({ activeThreadId: id }),
  setInputDraft: (value) => set({ inputDraft: value }),
}))
