/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabilita minificazione in produzione per evitare errore cssnano con selettori "/"
  // (Tailwind bg-white/5, ecc.). Riattiva quando il CSS è stato corretto.
  webpack: (config, { dev }) => {
    if (!dev) config.optimization.minimize = false
    return config
  },
}

module.exports = nextConfig

