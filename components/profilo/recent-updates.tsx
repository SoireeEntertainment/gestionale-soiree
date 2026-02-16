'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

type Comment = {
  id: string
  body: string
  type: string
  createdAt: Date
  work: { id: string; title: string }
  user: { id: string; name: string }
}

type RecentUpdatesProps = {
  comments: Comment[]
}

export function RecentUpdates({ comments }: RecentUpdatesProps) {
  if (comments.length === 0) {
    return (
      <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Ultimi aggiornamenti</h2>
        <p className="text-white/50">Nessun aggiornamento recente sui tuoi lavori.</p>
      </div>
    )
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">Ultimi aggiornamenti</h2>
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="border-l-2 border-accent/30 pl-4 py-1">
            <p className="text-white/90 text-sm">{c.body}</p>
            <p className="text-white/50 text-xs mt-1">
              <Link href={`/works/${c.work.id}`} className="text-accent hover:underline">
                {c.work.title}
              </Link>
              {' · '}
              {c.user.name} · {format(new Date(c.createdAt), 'dd MMM HH:mm', { locale: it })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
