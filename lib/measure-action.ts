'use client'

type MeasureMeta = {
  serverMs?: number
}

export async function measureAction<T>(
  name: string,
  asyncFn: () => Promise<T>,
  meta?: MeasureMeta
): Promise<T> {
  if (process.env.NODE_ENV !== 'development') {
    return asyncFn()
  }

  const start = performance.now()
  try {
    const result = await asyncFn()
    const clientMs = Math.round(performance.now() - start)
    const serverPart = meta?.serverMs != null ? ` | server: ${meta.serverMs}ms` : ''
    console.info(`[perf] ${name}: ${clientMs}ms${serverPart}`)
    return result
  } catch (error) {
    const clientMs = Math.round(performance.now() - start)
    console.warn(`[perf] ${name}: failed after ${clientMs}ms`)
    throw error
  }
}
