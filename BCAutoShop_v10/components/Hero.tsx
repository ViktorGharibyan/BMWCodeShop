'use client'

import Link from 'next/link'
import { useState } from 'react'

export function Hero() {
  const [lightsOn, setLightsOn] = useState(true)

  return (
    <section className={`precision-hero bmw-light-hero ${lightsOn ? 'lights-running' : 'lights-paused'}`} id="home">
      <div className="precision-hero-copy">
        <p className="eyebrow">BMW SPECIALISTS · QUEENS, NY</p>
        <h1>Your BMW.<br /><span>Precisely</span><br />your way.</h1>
        <p className="precision-lead">Coding. Diagnostics. Performance.</p>
        <p className="precision-description">From finding the fault to unlocking new possibilities. BMW-focused electronic work, tuning and retrofits in Jamaica, Queens.</p>
        <div className="actions">
          <Link className="button red" href="/booking">BOOK NOW <b aria-hidden="true">→</b></Link>
          <a className="text-link" href="#services">EXPLORE SERVICES ↓</a>
        </div>
      </div>

      <div className="bmw-scene">
        <div className="bmw-scene-image">
          <img src="/hero-bmw-blue.png" alt="Blue BMW M4 seen from the front, with LED headlights" width="1536" height="1024" fetchPriority="high" />
          <svg className="bmw-light-layer" viewBox="0 0 1536 1024" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="bmw-beam-gradient" x1="1" x2="0" y1="0.5" y2="0.5">
                <stop offset="0" stopColor="#d6eeff" stopOpacity=".32" />
                <stop offset=".5" stopColor="#86baff" stopOpacity=".08" />
                <stop offset="1" stopColor="#86baff" stopOpacity="0" />
              </linearGradient>
              <filter id="bmw-lamp-bloom" x="-100%" y="-200%" width="300%" height="500%">
                <feGaussianBlur stdDeviation="15" />
              </filter>
            </defs>
            <g className="bmw-beams">
              <path d="M 650 514 L -950 10 L -950 770 Z" fill="url(#bmw-beam-gradient)" />
              <path d="M 122 503 L -1000 90 L -1000 680 Z" fill="url(#bmw-beam-gradient)" />
            </g>
            <g className="bmw-lamp-glow" fill="#c9e9ff" filter="url(#bmw-lamp-bloom)">
              <ellipse cx="637" cy="520" rx="119" ry="17" transform="rotate(-7 637 520)" />
              <ellipse cx="122" cy="505" rx="37" ry="15" transform="rotate(18 122 505)" />
            </g>
            <g className="bmw-lamp-core" fill="none" stroke="#ecf8ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 550 534 L 569 541 L 604 533 L 632 510 L 620 501 M 642 531 L 657 535 L 702 525 L 727 497 L 716 491" />
              <path d="M 96 483 L 96 503 L 109 512 L 123 514 L 130 494 M 140 501 L 139 515 L 155 521 L 166 517" />
            </g>
          </svg>
        </div>
        <div className="bmw-scene-caption">
          <span>PRECISION IN EVERY DETAIL.</span>
          <button type="button" className="bmw-motion-toggle" aria-label="Headlight animation" aria-pressed={lightsOn} onClick={() => setLightsOn((value) => !value)}>
            <span aria-hidden="true">{lightsOn ? 'Ⅱ' : '▷'}</span> {lightsOn ? 'Pause lights' : 'Play lights'}
          </button>
        </div>
      </div>
      <div className="precision-footnote"><span>BUILT AROUND YOUR BMW</span><a href="#about">Meet BMWcodes <span aria-hidden="true">↓</span></a></div>
    </section>
  )
}
