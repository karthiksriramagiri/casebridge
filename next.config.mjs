/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    outputFileTracingIncludes: {
      '/nuances': ['./lib/nuances.html'],
    },
  },
  /* The old /metrics tree split into the Creative and Financial centers. Only
     the bare /metrics kept a redirect, so every deeper bookmark and Slack link
     — /metrics/firms/lhp, /metrics/oos-cases, /metrics/angles — 404'd. These
     map each old path onto its new home, most specific first, with a catch-all
     so nothing under the retired prefix can dead-end.

     Temporary (307), not permanent: a 308 is cached by the browser forever and
     these are internal pages behind auth, where staying able to change our mind
     is worth more than the redirect being cacheable. */
  async redirects() {
    return [
      { source: "/metrics/angles", destination: "/creative/angles", permanent: false },
      { source: "/metrics/oos-cases", destination: "/finance/oos-cases", permanent: false },
      { source: "/metrics/firms", destination: "/finance/firms", permanent: false },
      { source: "/metrics/firms/:path*", destination: "/finance/firms/:path*", permanent: false },
      { source: "/metrics/:path*", destination: "/creative", permanent: false },
    ]
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
