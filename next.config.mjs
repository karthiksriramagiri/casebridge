/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/sms",
        destination: "https://sms-bot-production-3b71.up.railway.app/dashboard",
      },
      {
        source: "/sms/:path*",
        destination: "https://sms-bot-production-3b71.up.railway.app/:path*",
      },
    ]
  },
}

export default nextConfig
