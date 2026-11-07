/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  // Ship less JS and stop leaking server internals
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  compiler: {
    // The codebase has hundreds of console.log calls in webhook/AI paths.
    // They cost real bytes and CPU on every request/response — strip them in
    // production builds while keeping warn/error for observability.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  experimental: {
    cpus: 2,
    optimizePackageImports: [
      'lucide-react',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // The legacy XSS auditor is removed from browsers and could be abused; disable explicitly.
            key: 'X-XSS-Protection',
            value: '0',
          },
          {
            // HTTPS only for a year. No includeSubDomains/preload: agency custom domains are tenant-owned.
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        // Cache static media aggressively; APIs stay dynamic
        source: '/assets/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

export default nextConfig
