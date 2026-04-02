/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /** Tree-shaking più aggressivo per import da barrel (bundle più piccoli). */
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  webpack: (config, { dev, isServer }) => {
    // Next inserisce il CSS minimizer come funzione che applica CssMinimizerPlugin (non come istanza).
    // cssnano-simple fallisce su selettori Tailwind con `/`. JS resta minificato (primo minimizer).
    if (!dev && !isServer && Array.isArray(config.optimization?.minimizer)) {
      config.optimization.minimizer = config.optimization.minimizer.filter((p) => {
        if (typeof p !== 'function') return true
        const src = Function.prototype.toString.call(p)
        return !src.includes('CssMinimizerPlugin')
      })
    }
    return config
  },
}

module.exports = nextConfig
