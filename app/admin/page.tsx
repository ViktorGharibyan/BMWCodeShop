'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'

const bookingEndpoint = process.env.NEXT_PUBLIC_BOOKING_API_URL ?? 'http://localhost:5080/api/bookings'
const apiBase = bookingEndpoint.replace(/\/api\/bookings\/?$/, '')
const tokenKey = 'bmwcodes_admin_token'

type Booking = {
  name: string
  phone: string
  vehicle: string
  service: string
  preferredDate: string
  message: string
  createdAt: string
}

type ApiState = 'checking' | 'ready' | 'offline' | 'unconfigured'

export default function AdminPage() {
  const [mode, setMode] = useState<'checking' | 'login' | 'dashboard'>('checking')
  const [apiState, setApiState] = useState<ApiState>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])

  async function verifySavedToken(token: string) {
    const response = await fetch(`${apiBase}/api/admin/bookings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!response.ok) throw new Error('Unauthorized')
    const data = await response.json() as { bookings: Booking[] }
    setBookings(data.bookings)
    setMode('dashboard')
    setApiState('ready')
  }

  useEffect(() => {
    const saved = window.sessionStorage.getItem(tokenKey)

    fetch(`${apiBase}/health`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('offline')
        setApiState('ready')
        if (!saved) {
          setMode('login')
          return
        }
        return verifySavedToken(saved).catch(() => {
          window.sessionStorage.removeItem(tokenKey)
          setMode('login')
        })
      })
      .catch(() => {
        setApiState('offline')
        setMode('login')
      })
  }, [])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch(`${apiBase}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json().catch(() => ({})) as { token?: string; message?: string; detail?: string }

      if (response.status === 503) {
        setApiState('unconfigured')
        throw new Error('Admin access is not configured on the backend yet.')
      }

      if (!response.ok || !data.token) throw new Error(data.message ?? 'Invalid login')

      window.sessionStorage.setItem(tokenKey, data.token)
      await verifySavedToken(data.token)
      setPassword('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in')
    }
  }

  function logout() {
    window.sessionStorage.removeItem(tokenKey)
    setMode('login')
    setBookings([])
  }

  if (mode === 'checking') {
    return <main className="admin-page admin-center">Checking access…</main>
  }

  if (mode === 'login') {
    return (
      <main className="admin-page admin-center">
        <form className="admin-login" onSubmit={login}>
          <p className="admin-kicker">BMWCODES LLC / PRIVATE</p>
          <h1>BOOKING<br /><span>ADMIN.</span></h1>
          <p>Sign in to review requests submitted through the website.</p>

          {apiState !== 'ready' && (
            <div className="admin-notice" role="status">
              <strong>{apiState === 'offline' ? 'Backend is not running.' : 'Admin access is not configured yet.'}</strong>
              <span>
                Start the backend from the <code>backend</code> folder and set the admin secrets. Open <code>backend/README_ADMIN.md</code> for the exact commands.
              </span>
            </div>
          )}

          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
          <button className="button red" type="submit">SIGN IN <b aria-hidden="true">→</b></button>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <Link href="/#home" className="admin-back">← Back to site</Link>
        </form>
      </main>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <div className="admin-header">
          <div>
            <p className="admin-kicker">BMWCODES LLC / PRIVATE</p>
            <h1>BOOKING <span>REQUESTS.</span></h1>
          </div>
          <button className="admin-logout" type="button" onClick={logout}>LOG OUT</button>
        </div>

        <div className="admin-stats">
          <div><strong>{bookings.length}</strong><span>Total shown</span></div>
          <div><strong>{bookings.filter((booking) => booking.preferredDate === today).length}</strong><span>For today</span></div>
        </div>

        {bookings.length === 0 ? (
          <div className="admin-empty">No booking requests yet.</div>
        ) : (
          <div className="booking-table-wrap">
            <table className="booking-table">
              <thead>
                <tr><th>Received</th><th>Name</th><th>Phone</th><th>Vehicle</th><th>Service</th><th>Date</th><th>Message</th></tr>
              </thead>
              <tbody>
                {bookings.map((booking, index) => (
                  <tr key={`${booking.createdAt}-${index}`}>
                    <td>{new Date(booking.createdAt).toLocaleString()}</td>
                    <td>{booking.name}</td>
                    <td><a href={`tel:${booking.phone.replace(/\D/g, '')}`}>{booking.phone}</a></td>
                    <td>{booking.vehicle}</td>
                    <td>{booking.service}</td>
                    <td>{booking.preferredDate}</td>
                    <td>{booking.message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
