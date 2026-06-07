type StepLike = { status: string }

export function calculateWorkStepProgress(steps: StepLike[]): {
  total: number
  completed: number
  percent: number
} {
  const total = steps.length
  const completed = steps.filter((s) => s.status === 'DONE').length
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { total, completed, percent }
}
