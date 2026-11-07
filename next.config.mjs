/**
 * Content Security Policy.
 * - script-src keeps 'unsafe-inline' because the App Router streams inline
 *   bootstrap scripts; moving to nonces needs every page to render dynamically.
 *   Foreign script hosts, plugins and <base> hijacking are still blocked.
 * - img-src allows any https host: DMs, comments and profile pictures come
 *   from Meta/TikTok CDNs whose hostnames rotate.
 * - connect-src lists what the browser itself calls: this app, Supabase
 *   (REST + realtime websocket), Vercel Analytics, Sentry and Meta's SDK.
 */
function originOf(value) {
  try {
    return value ? new URL(value).origin : null
  } catch {
    return null
  }
}

function contentSecurityPolicy() {
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN?.replace(/\/\/[^@]*@/, '//'))
  const connect = [
    "'self'",
    supabase,
    supabase && supabase.replace(/^https:/, 'wss:'),
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://vitals.vercel-insights.com',
    'https://va.vercel-scripts.com',
    'https://graph.facebook.com',
    'https://www.facebook.com',
    sentry,
  ].filter(Boolean)
  const dev = process.env.NODE_ENV !== 'production'
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", dev && "'unsafe-eval'", 'https://va.vercel-scripts.com', 'https://connect.facebook.net'].filter(Boolean),
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': dev ? [...connect, 'ws:', 'http://localhost:*'] : connect,
    'frame-src': ['https://www.facebook.com', 'https://web.facebook.com'],
    'media-src': ["'self'", 'blob:', 'https:'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://www.facebook.com', 'https://www.instagram.com', 'https://www.tiktok.com'],
    'frame-ancestors': ["'none'"],
  }
  const policy = Object.entries(directives).map(([key, values]) => `${key} ${values.join(' ')}`)
  if (!dev) policy.push('upgrade-insecure-requests')
  return policy.join('; ')
}

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
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy(),
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
