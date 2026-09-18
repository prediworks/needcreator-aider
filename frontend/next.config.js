const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { instrumentationHook: true },
  images: {
    domains: ['your-bucket.r2.dev'], // Add your Cloudflare R2 domain
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
      };
    }
    
    // Fix for undici/Firebase compatibility
    config.resolve.alias = {
      ...config.resolve.alias,
      'undici': false,
    };
    
    return config;
  },
  transpilePackages: ['firebase', '@firebase/auth'],
  // Adresses courtes attendues par les plateformes tierces (revue d'application Meta, stores)
  async redirects() {
    return [
      { source: '/privacy', destination: '/legal/confidentialite', permanent: true },
      { source: '/terms', destination: '/legal/cgu', permanent: true },
      { source: '/data-deletion', destination: '/legal/confidentialite#suppression', permanent: true },
    ];
  },
}

// Sentry : n'envoie les sourcemaps que si SENTRY_AUTH_TOKEN est défini (facultatif)
module.exports = withSentryConfig(nextConfig, { silent: true, widenClientFileUpload: false, disableLogger: true, sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN } })
