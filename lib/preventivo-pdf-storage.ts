import path from 'path'
import fs from 'fs/promises'
import { put, del, get } from '@vercel/blob'

const UPLOAD_DIR = 'uploads/preventivi'

export function useBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim())
}

/** True se il PDF è su Vercel Blob (URL assoluto). */
export function isBlobFilePath(filePath: string | null | undefined): boolean {
  return Boolean(filePath && filePath.startsWith('https://'))
}

/**
 * Salva il PDF e restituisce il valore da mettere in `Preventivo.filePath`
 * (percorso relativo locale oppure URL Blob).
 */
export async function savePreventivoPdfUpload(
  clientId: string,
  preventivoId: string,
  originalFileName: string,
  pdfBytes: ArrayBuffer
): Promise<string> {
  const ext = path.extname(originalFileName) || '.pdf'
  const buf = Buffer.from(pdfBytes)

  if (useBlobStorage()) {
    const { url } = await put(`preventivi/${clientId}/${preventivoId}${ext}`, buf, {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    })
    return url
  }

  const dir = path.join(process.cwd(), UPLOAD_DIR, clientId)
  await fs.mkdir(dir, { recursive: true })
  const safeName = `${preventivoId}${ext}`
  const absPath = path.join(dir, safeName)
  await fs.writeFile(absPath, buf)
  return path.join(UPLOAD_DIR, clientId, safeName)
}

export async function readPreventivoPdfBuffer(filePath: string): Promise<Buffer | null> {
  if (isBlobFilePath(filePath)) {
    const out = await get(filePath, { access: 'private' })
    if (!out || out.statusCode !== 200 || !out.stream) return null
    return Buffer.from(await new Response(out.stream).arrayBuffer())
  }

  const uploadsRoot = path.resolve(process.cwd(), 'uploads')
  const fullPath = path.resolve(process.cwd(), filePath)
  if (!fullPath.startsWith(uploadsRoot + path.sep)) return null
  try {
    return await fs.readFile(fullPath)
  } catch {
    return null
  }
}

export async function removePreventivoStoredFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return
  if (isBlobFilePath(filePath)) {
    try {
      await del(filePath)
    } catch {
      // blob già rimosso o store non disponibile
    }
    return
  }
  try {
    const uploadsRoot = path.resolve(process.cwd(), 'uploads')
    const fullPath = path.resolve(process.cwd(), filePath)
    if (!fullPath.startsWith(uploadsRoot + path.sep)) return
    await fs.unlink(fullPath)
  } catch {
    // ignore
  }
}
