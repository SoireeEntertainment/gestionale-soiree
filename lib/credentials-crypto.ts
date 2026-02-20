/**
 * Cifratura a riposo per credenziali clienti (username/password in client_credentials).
 * AES-256-GCM; chiave da CREDENTIALS_ENCRYPTION_KEY (32 byte in hex = 64 caratteri).
 * In produzione la chiave è obbligatoria: senza di essa lettura/scrittura credenziali fallisce.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const AUTH_TAG_LEN = 16
const SALT = 'soiree-credentials-v1'
const KEY_LEN = 32

const PREFIX = 'enc:v1:'

const PRODUCTION_REQUIRE_KEY_MSG =
  'In produzione è obbligatorio impostare CREDENTIALS_ENCRYPTION_KEY (Vercel: Project → Settings → Environment Variables). Genera con: npx tsx scripts/generate-credentials-key.ts'

function isProduction(): boolean {
  return (process.env.NODE_ENV as string) === 'production'
}

function getKey(): Buffer | null {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!raw || raw.length < 32) return null
  // Supporta chiave esadecimale (64 caratteri) o passphrase (derivata con scrypt)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  try {
    return scryptSync(raw, SALT, KEY_LEN)
  } catch {
    return null
  }
}

/**
 * Cifra un valore (es. password o username). In produzione la chiave è obbligatoria.
 */
export function encryptCredentialValue(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null
  const key = getKey()
  if (!key) {
    if (isProduction()) throw new Error(PRODUCTION_REQUIRE_KEY_MSG)
    return plain
  }
  try {
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv(ALGO, key, iv)
    const enc = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()
    const combined = Buffer.concat([iv, enc, tag])
    return PREFIX + combined.toString('base64')
  } catch {
    return plain
  }
}

/**
 * Decifra un valore. Se non ha il prefisso enc:v1: restituisce il valore così com'è (legacy plaintext).
 * In produzione la chiave è obbligatoria per decifrare valori cifrati.
 */
export function decryptCredentialValue(cipher: string | null | undefined): string | null {
  if (cipher == null || cipher === '') return null
  if (!cipher.startsWith(PREFIX)) return cipher
  const key = getKey()
  if (!key) {
    if (isProduction()) throw new Error(PRODUCTION_REQUIRE_KEY_MSG)
    return cipher
  }
  try {
    const buf = Buffer.from(cipher.slice(PREFIX.length), 'base64')
    if (buf.length < IV_LEN + AUTH_TAG_LEN) return cipher
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(buf.length - AUTH_TAG_LEN)
    const enc = buf.subarray(IV_LEN, buf.length - AUTH_TAG_LEN)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(enc) + decipher.final('utf8')
  } catch {
    return null
  }
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null
}
