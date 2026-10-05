'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { services } from '@/data/services'

const bookingApiUrl = process.env.NEXT_PUBLIC_BOOKING_API_URL ?? 'http://localhost:5080/api/bookings'
const allowedServices = new Set([...services.map((service) => service.title), 'Other'])
const shopTimeZone = 'America/New_York'

function formatUSPhone(digitsValue: string) {
  const digits = digitsValue.replace(/\D/g, '').replace(/^1/, '').slice(0, 10)
  if (!digits) return '+1 '
  if (digits.length <= 3) return `+1 (${digits}`
  if (digits.length <= 6) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function getShopDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: shopTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function isoFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatUSDate(iso: string) {
  if (!iso) return 'MM/DD/YYYY'
  const [year, month, day] = iso.split('-')
  return `${month}/${day}/${year}`
}

function addOneMonthClamped(year: number, month: number, day: number) {
  const targetMonthIndex = month // input month is 1-based, so this is next month as zero-based index
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const normalizedMonthIndex = targetMonthIndex % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate()
  return {
    year: targetYear,
    month: normalizedMonthIndex + 1,
    day: Math.min(day, lastDay),
  }
}

function monthKey(year: number, month: number) {
  return year * 12 + (month - 1)
}

export function BookingForm() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)

  const dateLimits = useMemo(() => {
    const today = getShopDateParts()
    const max = addOneMonthClamped(today.year, today.month, today.day)
    return {
      min: isoFromParts(today.year, today.month, today.day),
      max: isoFromParts(max.year, max.month, max.day),
      today,
      maxParts: max,
    }
  }, [])

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = getShopDateParts()
    return { year: today.year, month: today.month }
  })

  useEffect(() => {
    const service = searchParams.get('service')?.trim() ?? ''
    if (service && allowedServices.has(service)) setSelectedService(service)
  }, [searchParams])

  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const cells: Array<number | null> = Array(firstWeekday).fill(null)
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [calendarMonth])

  const minMonthKey = monthKey(dateLimits.today.year, dateLimits.today.month)
  const maxMonthKey = monthKey(dateLimits.maxParts.year, dateLimits.maxParts.month)
  const currentMonthKey = monthKey(calendarMonth.year, calendarMonth.month)

  function changeMonth(delta: number) {
    const nextIndex = calendarMonth.year * 12 + (calendarMonth.month - 1) + delta
    const nextYear = Math.floor(nextIndex / 12)
    const nextMonth = (nextIndex % 12) + 1
    const nextKey = monthKey(nextYear, nextMonth)
    if (nextKey < minMonthKey || nextKey > maxMonthKey) return
    setCalendarMonth({ year: nextYear, month: nextMonth })
  }

  function pickDate(day: number) {
    const iso = isoFromParts(calendarMonth.year, calendarMonth.month, day)
    if (iso < dateLimits.min || iso > dateLimits.max) return
    setPreferredDate(iso)
    setCalendarOpen(false)
    setStatus('idle')
    setErrorMessage('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (status === 'sending') return
    setStatus('sending')
    setErrorMessage('')

    if (!preferredDate || preferredDate < dateLimits.min || preferredDate > dateLimits.max) {
      setStatus('error')
      setErrorMessage('Choose a preferred date from today through one month ahead.')
      return
    }

    const form = new FormData(formElement)
    const payload = Object.fromEntries(form.entries()) as Record<string, FormDataEntryValue>
    payload.phone = formatUSPhone(String(payload.phone ?? ''))
    payload.preferredDate = preferredDate

    try {
      const response = await fetch(bookingApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(result?.message ?? 'Booking request failed')
      }

      setStatus('sent')
      setPhoneDigits('')
      setPreferredDate('')
      setSelectedService('')
      setCalendarOpen(false)
      formElement.reset()
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Could not send. Call the shop and we will help you.')
    }
  }

  if (status === 'sent') {
    return (
      <section className="booking-success" aria-live="polite">
        <div className="booking-success-icon" aria-hidden="true">✓</div>
        <p className="booking-success-kicker">REQUEST RECEIVED</p>
        <h2>We’ll contact you shortly.</h2>
        <p>
          Your booking request has been sent to BMWcodes LLC. We’ll confirm availability, service details and pricing with you directly.
        </p>
        <a className="booking-success-phone" href="tel:+15162465128">+1 (516) 246-5128</a>
        <div className="booking-success-actions">
          <Link className="button red" href="/#home">BACK HOME <b aria-hidden="true">→</b></Link>
          <button className="booking-success-again" type="button" onClick={() => setStatus('idle')}>SEND ANOTHER REQUEST</button>
        </div>
      </section>
    )
  }

  return (
    <form className="booking-form" onSubmit={submit}>
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
          aria-describedby="phone-help"
        />
        <small id="phone-help">10-digit U.S. number</small>
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

      <div className="booking-date-field">
        <span className="booking-date-label">Preferred date <b>*</b></span>
        <button
          className={`date-picker-trigger ${preferredDate ? 'has-value' : ''}`}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
          onClick={() => setCalendarOpen((open) => !open)}
        >
          <span>{formatUSDate(preferredDate)}</span>
          <span className="date-picker-icon" aria-hidden="true" />
        </button>
        <small>New York time · today through one month ahead</small>

        {calendarOpen && (
          <div className="date-picker" role="dialog" aria-label="Choose preferred date">
            <div className="date-picker-head">
              <button type="button" onClick={() => changeMonth(-1)} disabled={currentMonthKey <= minMonthKey} aria-label="Previous month">←</button>
              <strong>
                {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(calendarMonth.year, calendarMonth.month - 1, 1)),
                )}
              </strong>
              <button type="button" onClick={() => changeMonth(1)} disabled={currentMonthKey >= maxMonthKey} aria-label="Next month">→</button>
            </div>
            <div className="date-picker-weekdays" aria-hidden="true">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="date-picker-grid">
              {calendarDays.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} className="date-picker-empty" />
                const iso = isoFromParts(calendarMonth.year, calendarMonth.month, day)
                const disabled = iso < dateLimits.min || iso > dateLimits.max
                const selected = iso === preferredDate
                const today = iso === dateLimits.min
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`${selected ? 'is-selected' : ''} ${today ? 'is-today' : ''}`}
                    disabled={disabled}
                    onClick={() => pickDate(day)}
                    aria-label={formatUSDate(iso)}
                    aria-pressed={selected}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <label className="full">
        Message
        <textarea name="message" rows={4} maxLength={1000} placeholder="Tell us what you need done (optional)." />
      </label>

      <input className="honeypot" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <button className="button red" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'SENDING…' : 'SEND REQUEST'}
        <b aria-hidden="true">→</b>
      </button>

      {status === 'error' && <p className="form-status error" aria-live="polite">{errorMessage || 'Could not send. Call the shop and we will help you.'}</p>}
    </form>
  )
}
