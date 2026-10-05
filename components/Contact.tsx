import Link from 'next/link'

const instagramUrl = 'https://www.instagram.com/bmwcodes/'
const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=BMWcodes+LLC+Jamaica+Queens+NY'
const mapsEmbedUrl = 'https://www.google.com/maps?q=BMWcodes+LLC+Jamaica+Queens+NY&output=embed'

export function Contact() {
  return (
    <section className="contact section" id="contact">
      <div className="contact-inner">
        <div className="contact-copy">
          <p className="location">Jamaica, Queens, NY</p>
          <h2>
            TALK TO
            <br />
            <span>THE SHOP.</span>
          </h2>
          <div className="contact-actions">
            <a className="contact-phone" href="tel:+15162465128">
              +1 (516) 246-5128
            </a>
            <div className="contact-buttons">
              <Link className="button red" href="/booking">
                BOOK NOW <b aria-hidden="true">→</b>
              </Link>
              <a className="button red" href={mapsUrl} target="_blank" rel="noreferrer">
                GET DIRECTIONS <b aria-hidden="true">↗</b>
              </a>
              <a className="button red" href={instagramUrl} target="_blank" rel="noreferrer">
                INSTAGRAM @BMWCODES <b aria-hidden="true">↗</b>
              </a>
            </div>
          </div>
        </div>

        <div className="contact-map-wrap">
          <div className="contact-map-head">
            <span>BMWcodes LLC</span>
            <span>Google Maps</span>
          </div>
          <div className="contact-map">
            <iframe
              title="BMWcodes LLC location on Google Maps"
              src={mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
