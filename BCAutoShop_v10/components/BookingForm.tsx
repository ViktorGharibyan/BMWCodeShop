'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BookingCalendar } from './BookingCalendar'
import { bookingDateLimits, usDate } from '@/lib/shop-date'
import { services } from '@/data/services'

const bookingApiUrl = process.env.NEXT_PUBLIC_BOOKING_API_URL ?? 'http://localhost:5080/api/bookings'
const allowedServices = new Set([...services.map((service) => service.title), 'Other'])

function formatUSPhone(digitsValue: string) {
  const digits = digitsValue.replace(/\D/g, '').replace(/^1/, '').slice(0, 10)
  if (!digits) return '+1 '
  if (digits.length <= 3) return `+1 (${digits}`
  if (digits.length <= 6) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function BookingForm() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const inFlight = useRef(false)
  const successRef = useRef<HTMLDivElement>(null)
  const [receipt, setReceipt] = useState<{ phone: string; date: string; service: string } | null>(null)
  const [dateLimits, setDateLimits] = useState<{ min: string; max: string } | null>(null)
  const [selectedService, setSelectedService] = useState('')

  useEffect(() => {
    const service = searchParams.get('service')?.trim() ?? ''
    if (service && allowedServices.has(service)) setSelectedService(service)
  }, [searchParams])

  useEffect(() => {
    const refresh = () => setDateLimits(bookingDateLimits())
    refresh()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  useEffect(() => { if (status === 'sent') successRef.current?.focus() }, [status])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (inFlight.current) return
    setStatus('sending')
    setErrorMessage('')

    const form = new FormData(formElement)
    const payload = Object.fromEntries(form.entries()) as Record<string, FormDataEntryValue>
    payload.phone = formatUSPhone(String(payload.phone ?? ''))

    const limits = bookingDateLimits()
    setDateLimits(limits)
    if (!preferredDate || preferredDate < limits.min || preferredDate > limits.max) {
      setStatus('error')
      setErrorMessage('Choose an available date from the calendar (New York time).')
      return
    }
    if (phoneDigits.length !== 10) {
      setStatus('error')
      setErrorMessage('Enter a complete 10-digit US phone number.')
      return
    }
    payload.preferredDate = preferredDate
    inFlight.current = true

    try {
      const response = await fetch(bookingApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null
        const validationMessage = result?.errors ? Object.values(result.errors).flat().join(' ') : ''
        throw new Error(result?.message || validationMessage || 'Booking request failed. Please try again later.')
      }

      setReceipt({ phone: String(payload.phone), date: preferredDate, service: selectedService })
      setStatus('sent')
      setPhoneDigits('')
      setPreferredDate('')
      setSelectedService('')
      formElement.reset()
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Could not send. Call or DM the shop.')
    } finally {
      inFlight.current = false
    }
  }

  if (status === 'sent' && receipt) return (
    <div className="booking-success" ref={successRef} tabIndex={-1}>
      <span className="booking-success-icon" aria-hidden="true">✓</span>
      <p className="booking-success-kicker">BMWCODES · REQUEST SENT</p>
      <h2>Request received</h2>
      <p>We’ll contact you shortly at <strong>{receipt.phone}</strong>.</p>
      <dl><div><dt>Service</dt><dd>{receipt.service}</dd></div><div><dt>Preferred date</dt><dd>{usDate(receipt.date)}</dd></div></dl>
      <p className="booking-success-note">Your preferred date is a request. We’ll confirm availability with you.</p>
      <Link className="button red" href="/">BACK HOME <b aria-hidden="true">→</b></Link>
      <a className="booking-success-call" href="tel:+15162465128">Questions? +1 (516) 246-5128</a>
    </div>
  )

  return (
    <form className="booking-form" onSubmit={submit} aria-busy={status === 'sending'}>
      <fieldset className="booking-fields" disabled={status === 'sending'}>
      <label>
        Name <span>*</span>
        <input name="name" required maxLength={80} autoComplete="name" placeholder="Your name" />
      </label>

      <label>
        US phone <span>*</span>
        <input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={formatUSPhone(phoneDigits)}
          onChange={(event) => setPhoneDigits(event.target.value.replace(/\D/g, '').replace(/^1/, '').slice(0, 10))}
          placeholder="+1 (516) 246-5128"
          maxLength={18}
        />
      </label>

      <label>
        Vehicle <span>*</span>
        <input name="vehicle" required maxLength={100} autoComplete="off" placeholder="Year / model" />
      </label>

      <label>
        Service <span>*</span>
        <span className="select-wrap">
          <select
            name="service"
            required
            value={selectedService}
            onChange={(event) => setSelectedService(event.target.value)}
            aria-label="Select service"
          >
            <option value="" disabled>Select service</option>
            {services.map((service) => (
              <option key={service.title} value={service.title}>{service.title}</option>
            ))}
            <option value="Other">OTHER</option>
          </select>
        </span>
      </label>

      {dateLimits ? <BookingCalendar value={preferredDate} min={dateLimits.min} max={dateLimits.max}
        onChange={setPreferredDate} disabled={status === 'sending'} /> : <p role="status">Loading calendar…</p>}

      <label className="full">
        Message
        <textarea name="message" rows={4} maxLength={1000} placeholder="Tell us what you need done (optional)." />
      </label>

      <input
        className="honeypot"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      </fieldset>
      <button className="button red" type="submit" disabled={status === 'sending' || !dateLimits}>
        {status === 'sending' && <span className="booking-spinner" aria-hidden="true" />}
        {status === 'sending' ? 'SENDING REQUEST…' : 'SEND REQUEST'}
        <b aria-hidden="true">→</b>
      </button>

      {status === 'sending' && <p className="form-status" role="status">Sending your request. Please wait…</p>}
      {status === 'error' && <p className="form-status error" aria-live="polite">{errorMessage || 'Could not send. Call or DM the shop.'}</p>}
    </form>
  )
}
