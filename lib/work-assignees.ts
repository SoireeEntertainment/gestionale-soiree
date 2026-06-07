export function formatAssignees(assignees: { id: string; name: string }[]): string {
  if (assignees.length === 0) return 'Non assegnato'
  if (assignees.length === 1) return assignees[0].name
  return `${assignees[0].name} +${assignees.length - 1}`
}

export function assigneeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
