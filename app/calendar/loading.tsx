export default function CalendarLoading() {
  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="h-9 w-48 bg-white/10 rounded animate-pulse mb-6" />
        <div className="h-24 bg-white/5 rounded-lg animate-pulse mb-4" />
        <div className="h-64 bg-white/5 rounded-lg animate-pulse" />
      </div>
    </div>
  )
}
