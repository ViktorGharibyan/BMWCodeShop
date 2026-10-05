'use client'

import { useEffect, useRef, useState } from 'react'
import { usDate } from '@/lib/shop-date'

type Props = { value: string; min: string; max: string; onChange: (value: string) => void; disabled: boolean }

export function BookingCalendar({ value, min, max, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(min.slice(0, 7))
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    panel.current?.querySelector<HTMLButtonElement>('button[data-selected="true"], button[data-day]:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, month])
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const heading = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  function move(direction: number) {
    setMonth(new Date(Date.UTC(year, monthNumber - 1 + direction, 1)).toISOString().slice(0, 7))
  }
  return (
    <div className="booking-calendar" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }}>
      <span id="booking-date-label" className="booking-field-title">Preferred date <span>*</span></span>
      <button type="button" ref={trigger} className="calendar-trigger" disabled={disabled}
        aria-labelledby="booking-date-label booking-date-value" aria-expanded={open} aria-controls="booking-calendar-panel"
        onClick={() => { setMonth((value || min).slice(0, 7)); setOpen(!open) }}>
        <span id="booking-date-value">{value ? usDate(value) : 'MM/DD/YYYY'}</span><span aria-hidden="true">▦</span>
      </button>
      {open && <div className="calendar-panel" id="booking-calendar-panel" ref={panel} role="group" aria-label="Choose preferred date">
        <div className="calendar-heading">
          <button type="button" aria-label="Previous month" disabled={month <= min.slice(0, 7)} onClick={() => move(-1)}>‹</button>
          <strong aria-live="polite">{heading}</strong>
          <button type="button" aria-label="Next month" disabled={month >= max.slice(0, 7)} onClick={() => move(1)}>›</button>
        </div>
        <div className="calendar-grid" onKeyDown={(event) => {
          const shift = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
          const day = (event.target as HTMLElement).dataset.day
          if (!shift || !day) return
          event.preventDefault()
          panel.current?.querySelector<HTMLButtonElement>(`button[data-day="${Number(day) + shift}"]:not(:disabled)`)?.focus()
        }}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => <span key={label} className="calendar-weekday">{label}</span>)}
          {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={`empty-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1
            const iso = `${month}-${String(day).padStart(2, '0')}`
            return <button key={iso} type="button" data-day={day} data-selected={value === iso}
              aria-label={new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'full', timeZone: 'UTC' })}
              aria-pressed={value === iso} aria-current={iso === min ? 'date' : undefined}
              disabled={iso < min || iso > max} onClick={() => { onChange(iso); setOpen(false); trigger.current?.focus() }}>{day}</button>
          })}
        </div>
      </div>}
      <small>New York time · {usDate(min)}–{usDate(max)}</small>
    </div>
  )
}
