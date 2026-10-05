'use client'

import { useState } from 'react'
import Link from 'next/link'

export type Service = {
  type: string
  title: string
  description: string
  detailTitle: string
  bullets: string[]
  result: string
}

export function ServiceCard({ item }: { item: Service }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <article className={`service-card ${expanded ? 'is-expanded' : ''}`}>
      <div className="service-card-topline">{item.type}</div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>

      <div className="service-card-summary">
        <span className="service-chip">{item.detailTitle}</span>
        <button
          className="service-expand"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide details' : 'Explore service'}
        </button>
      </div>

      <div className="service-details" hidden={!expanded}>
        <ul>
          {item.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <p className="service-result">{item.result}</p>
        <div className="service-actions">
          <Link className="service-book" href={`/booking?service=${encodeURIComponent(item.title)}`}>
            Book this service <b aria-hidden="true">→</b>
          </Link>
        </div>
      </div>

      <span className="service-arrow" aria-hidden="true">→</span>
    </article>
  )
}
