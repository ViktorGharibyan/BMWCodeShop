import Link from 'next/link'
import { services } from '@/data/services'
import { SectionTitle } from './SectionTitle'
import { ServiceCard } from './ServiceCard'

export function Services() {
  return (
    <section className="services section" id="services">
      <div className="services-inner">
        <SectionTitle>
          OUR
          <br />
          <span>SERVICES.</span>
        </SectionTitle>
        <div className="services-grid">
          {services.map((item) => <ServiceCard key={item.title} item={item} />)}
        </div>
        <div className="services-cta">
          <p>
            Not sure which service your BMW needs? Tell us the year, model and what is going on. We will point you in the right direction.
          </p>
          <Link className="button red" href="/booking">
            REQUEST SERVICE <b aria-hidden="true">→</b>
          </Link>
        </div>
      </div>
    </section>
  )
}
