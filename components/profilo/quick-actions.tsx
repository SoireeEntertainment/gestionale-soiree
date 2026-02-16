'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

type QuickActionsProps = {
  canWrite: boolean
}

export function QuickActions({ canWrite }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {canWrite && (
        <Link href="/works?nuovo=1">
          <Button style={{ backgroundColor: 'var(--accent)', color: 'var(--dark)', padding: '8px 16px', borderRadius: '6px', fontWeight: 500 }}>
            Crea nuovo lavoro (assegnato a me)
          </Button>
        </Link>
      )}
      <Link href="/calendar">
        <Button variant="ghost" style={{ backgroundColor: 'transparent', color: 'rgba(255,255,255,0.8)', padding: '8px 16px', borderRadius: '6px' }}>
          Apri calendario
        </Button>
      </Link>
      <Link href="/profilo#lavori-attivi">
        <Button variant="ghost" style={{ backgroundColor: 'transparent', color: 'rgba(255,255,255,0.8)', padding: '8px 16px', borderRadius: '6px' }}>
          Vai ai lavori in scadenza
        </Button>
      </Link>
    </div>
  )
}
