'use client'

type ProfileHeaderProps = {
  name: string
  email: string
  role: string
  kpis: {
    activeCount: number
    dueIn7Count: number
    overdueCount: number
    inReviewOrWaitingCount: number
  }
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  AGENTE: 'Agente',
}

export function ProfileHeader({ name, email, role, kpis }: ProfileHeaderProps) {
  return (
    <div
      className="bg-dark border border-accent/20 rounded-xl p-6 mb-8"
      style={{ backgroundColor: 'var(--dark)', border: '1px solid rgba(16,249,199,0.2)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}
    >
      <div className="flex flex-wrap items-start gap-6">
        <div
          className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent text-2xl font-bold shrink-0"
          style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(16,249,199,0.2)', color: 'var(--accent)', fontSize: '1.5rem', fontWeight: 700 }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          <p className="text-white/60 text-sm mt-0.5">{email}</p>
          <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
            {roleLabels[role] ?? role}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
        <div className="bg-white/5 rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
          <div className="text-2xl font-bold text-white" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpis.activeCount}</div>
          <div className="text-xs text-white/60 mt-1" style={{ marginTop: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Lavori attivi</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
          <div className="text-2xl font-bold text-accent" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{kpis.dueIn7Count}</div>
          <div className="text-xs text-white/60 mt-1" style={{ marginTop: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>In scadenza (7 gg)</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
          <div className="text-2xl font-bold text-red-400" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>{kpis.overdueCount}</div>
          <div className="text-xs text-white/60 mt-1" style={{ marginTop: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>In ritardo</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1rem' }}>
          <div className="text-2xl font-bold text-amber-400" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>{kpis.inReviewOrWaitingCount}</div>
          <div className="text-xs text-white/60 mt-1" style={{ marginTop: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>In revisione / Attesa cliente</div>
        </div>
      </div>
    </div>
  )
}
