/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['your-bucket.r2.dev'], // Add your Cloudflare R2 domain
  },
}

module.exports = nextConfig
