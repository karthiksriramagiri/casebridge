import { proxy } from './proxy'

export const middleware = proxy

export const config = {
  matcher: ['/teams/:path*', '/metrics/:path*', '/dialer/:path*'],
}
