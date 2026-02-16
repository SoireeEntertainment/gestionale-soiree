import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-white/70 mb-6">Pagina non trovata</p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 rounded-md font-medium bg-accent text-dark hover:bg-accent/90"
        >
          Torna alla Dashboard
        </Link>
      </div>
    </div>
  )
}
