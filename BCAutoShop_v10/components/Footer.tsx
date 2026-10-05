import Link from 'next/link'

const instagramUrl = 'https://www.instagram.com/bmwcodes/'
const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=BMWcodes+LLC+Jamaica+Queens+NY'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand-column">
          <Link className="brand-logo footer-logo" href="/#home" aria-label="BMWcodes LLC">
            <img src="/bmwcodes-logo-dark-cropped.png" alt="BMWcodes LLC" />
          </Link>
          <p className="footer-tagline">
            BMW coding, diagnostics, ECU/DME work, tuning, installs, repairs and service in Queens, NY.
          </p>
        </div>

        <div className="footer-column">
          <span className="footer-heading">Navigate</span>
          <Link href="/#home">Home</Link>
          <Link href="/#about">About</Link>
          <Link href="/#services">Services</Link>
          <Link href="/#estimate">Estimate</Link>
          <Link href="/#projects">Projects</Link>
          <Link href="/#contact">Contact</Link>
        </div>

        <div className="footer-column">
          <span className="footer-heading">Contact</span>
          <a href="tel:+15162465128">+1 (516) 246-5128</a>
          <a href={instagramUrl} target="_blank" rel="noreferrer">Instagram @bmwcodes</a>
          <a href={mapsUrl} target="_blank" rel="noreferrer">Jamaica, Queens, NY</a>
          <Link className="footer-book" href="/booking">Book Now <b aria-hidden="true">→</b></Link>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} BMWcodes LLC. All rights reserved.</span>
        <div className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/#home">Back to top ↑</Link>
        </div>
      </div>
    </footer>
  )
}
