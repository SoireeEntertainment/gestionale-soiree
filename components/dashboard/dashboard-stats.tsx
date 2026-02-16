'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface Work {
  id: string
  title: string
  deadline: Date | null
  client: {
    name: string
  }
  category: {
    name: string
  }
}

interface DashboardStatsProps {
  totalClients: number
  totalWorks: number
  worksInDeadline: Work[]
  expiredWorks: Work[]
  inReviewWorks: Work[]
}

export function DashboardStats({
  totalClients,
  totalWorks,
  worksInDeadline,
  expiredWorks,
  inReviewWorks,
}: DashboardStatsProps) {
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--dark, #0c0e11)',
    border: '1px solid rgba(16, 249, 199, 0.2)',
    borderRadius: '0.5rem',
    padding: '1.5rem',
  }
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  }
  const grid2Style: React.CSSProperties = {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  }

  return (
    <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ ...gridStyle, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="bg-dark border border-accent/20 rounded-lg p-6" style={cardStyle}>
          <div className="text-3xl font-bold text-accent mb-2" style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--accent, #10f9c7)', marginBottom: '0.5rem' }}>{totalClients}</div>
          <div className="text-white/70" style={{ color: 'rgba(255,255,255,0.7)' }}>Clienti Totali</div>
        </div>
        <div className="bg-dark border border-accent/20 rounded-lg p-6" style={cardStyle}>
          <div className="text-3xl font-bold text-accent mb-2" style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--accent, #10f9c7)', marginBottom: '0.5rem' }}>{totalWorks}</div>
          <div className="text-white/70" style={{ color: 'rgba(255,255,255,0.7)' }}>Lavori Totali</div>
        </div>
        <div className="bg-dark border border-accent/20 rounded-lg p-6" style={cardStyle}>
          <div className="text-3xl font-bold text-accent mb-2" style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--accent, #10f9c7)', marginBottom: '0.5rem' }}>{expiredWorks.length}</div>
          <div className="text-white/70" style={{ color: 'rgba(255,255,255,0.7)' }}>Lavori Scaduti</div>
        </div>
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={grid2Style}>
        {/* In Scadenza */}
        <div className="bg-dark border border-accent/20 rounded-lg p-6" style={cardStyle}>
          <h2 className="text-xl font-semibold mb-4 text-white" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: '#fff' }}>In Scadenza (7 giorni)</h2>
          {worksInDeadline.length === 0 ? (
            <p className="text-white/50" style={{ color: 'rgba(255,255,255,0.5)' }}>Nessun lavoro in scadenza</p>
          ) : (
            <ul className="space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {worksInDeadline.map((work) => (
                <li key={work.id} className="text-sm" style={{ fontSize: '0.875rem' }}>
                  <Link
                    href={`/works/${work.id}`}
                    className="text-accent hover:underline block"
                    style={{ color: 'var(--accent, #10f9c7)', textDecoration: 'none', display: 'block' }}
                  >
                    {work.title}
                  </Link>
                  <span className="text-white/50 text-xs" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                    {work.client.name} • {work.category.name} •{' '}
                    {work.deadline && format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Scaduti */}
        <div className="bg-dark border border-accent/20 rounded-lg p-6" style={cardStyle}>
          <h2 className="text-xl font-semibold mb-4 text-white" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: '#fff' }}>Scaduti</h2>
          {expiredWorks.length === 0 ? (
            <p className="text-white/50" style={{ color: 'rgba(255,255,255,0.5)' }}>Nessun lavoro scaduto</p>
          ) : (
            <ul className="space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {expiredWorks.map((work) => (
                <li key={work.id} className="text-sm" style={{ fontSize: '0.875rem' }}>
                  <Link
                    href={`/works/${work.id}`}
                    className="text-red-400 hover:underline block"
                    style={{ color: '#f87171', textDecoration: 'none', display: 'block' }}
                  >
                    {work.title}
                  </Link>
                  <span className="text-white/50 text-xs" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block' }}>
                    {work.client.name} • {work.category.name} •{' '}
                    {work.deadline && format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* In Revisione / Attesa Cliente */}
        <div className="bg-dark border border-accent/20 rounded-lg p-6 lg:col-span-2" style={{ ...cardStyle, gridColumn: '1 / -1' }}>
          <h2 className="text-xl font-semibold mb-4 text-white" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: '#fff' }}>In Revisione / Attesa Cliente</h2>
          {inReviewWorks.length === 0 ? (
            <p className="text-white/50" style={{ color: 'rgba(255,255,255,0.5)' }}>Nessun lavoro in revisione o in attesa</p>
          ) : (
            <ul className="space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {inReviewWorks.map((work) => (
                <li key={work.id} className="text-sm" style={{ fontSize: '0.875rem' }}>
                  <Link
                    href={`/works/${work.id}`}
                    className="text-accent hover:underline block"
                    style={{ color: 'var(--accent, #10f9c7)', textDecoration: 'none', display: 'block' }}
                  >
                    {work.title}
                  </Link>
                  <span className="text-white/50 text-xs" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                    {work.client.name} • {work.category.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

