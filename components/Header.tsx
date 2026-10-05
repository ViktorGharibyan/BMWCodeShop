'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Home', href: '/#home', id: 'home' },
  { label: 'About', href: '/#about', id: 'about' },
  { label: 'Services', href: '/#services', id: 'services' },
  { label: 'Estimate', href: '/#estimate', id: 'estimate' },
  { label: 'Projects', href: '/#projects', id: 'projects' },
  { label: 'Contact', href: '/#contact', id: 'contact' },
]

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const isHomePage = pathname === '/'
  const [activeSection, setActiveSection] = useState(isHomePage ? 'home' : '')
  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (!isHomePage) {
      setActiveSection('')
      return
    }

    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[]

    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visible[0]?.target.id) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0.05, 0.2, 0.5] },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [isHomePage])

  return (
    <header className="header">
      <Link className="brand-logo" href="/#home" aria-label="BMWcodes LLC" onClick={closeMenu}>
        <img src="/bmwcodes-logo-dark-cropped.png" alt="BMWcodes LLC" />
      </Link>

      <nav aria-label="Primary navigation">
        {navItems.map((item) => (
          <Link
            key={item.label}
            className={`nav-link ${activeSection === item.id ? 'is-active' : ''}`}
            href={item.href}
            onClick={closeMenu}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        <a className="phone-mini" href="tel:+15162465128" aria-label="Call BMWcodes LLC at +1 (516) 246-5128">
          +1 (516) 246-5128
        </a>
        <Link className="book-nav" href="/booking" onClick={closeMenu}>
          Book Now
        </Link>
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
        </button>
      </div>

      {menuOpen && (
        <div className="mobile-menu" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <Link key={item.label} className={activeSection === item.id ? 'is-active' : ''} href={item.href} onClick={closeMenu}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
