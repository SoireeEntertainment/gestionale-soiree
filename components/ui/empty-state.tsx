interface EmptyStateProps {
  title: string
  description?: string
  className?: string
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={className ?? 'p-12 text-center text-white/50'}>
      <p>{title}</p>
      {description ? <p className="text-sm text-white/40 mt-2">{description}</p> : null}
    </div>
  )
}
