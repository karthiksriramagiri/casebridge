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
      // Proxy the bot's internal nav links (they use /dashboard/* absolute paths)
      {
        source: "/dashboard",
        destination: "https://sms-bot-production-3b71.up.railway.app/dashboard",
      },
      {
        source: "/dashboard/:path*",
        destination: "https://sms-bot-production-3b71.up.railway.app/dashboard/:path*",
      },
      {
        source: "/backfill",
        destination: "https://sms-bot-production-3b71.up.railway.app/backfill",
      },
    ]
  },
}

export default nextConfig
