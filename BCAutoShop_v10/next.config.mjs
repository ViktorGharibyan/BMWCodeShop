import { PHASE_PRODUCTION_BUILD } from 'next/constants.js'

export default function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD) {
    let endpoint
    try { endpoint = new URL(process.env.NEXT_PUBLIC_BOOKING_API_URL ?? '') } catch {
      throw new Error('Set NEXT_PUBLIC_BOOKING_API_URL before building, e.g. https://your-api.up.railway.app/api/bookings')
    }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/api/bookings') {
      throw new Error('NEXT_PUBLIC_BOOKING_API_URL must be an HTTPS URL ending in /api/bookings, with no credentials or query string.')
    }
  }
  return {
    poweredByHeader: false,
    async headers() {
      return [{ source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ] }]
    },
  }
}
