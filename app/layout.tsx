import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { ClerkProviderWrapper } from '@/components/providers/clerk-provider'

export const metadata: Metadata = {
  title: 'Gestionale Soirëe Studio',
  description: 'Sistema di gestione clienti e lavori',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          backgroundColor: 'var(--dark, #0c0e11)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <ClerkProviderWrapper>
          {children}
          <Toaster />
        </ClerkProviderWrapper>
      </body>
    </html>
  )
}
