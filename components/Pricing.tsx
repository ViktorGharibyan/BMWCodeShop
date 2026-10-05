import Link from 'next/link'
import { SectionTitle } from './SectionTitle'

export function Pricing() {
  return (
    <section className="pricing section" id="estimate">
      <SectionTitle>
        GET AN
        <br />
        <span>ESTIMATE.</span>
      </SectionTitle>
      <div className="offer">
        <div className="offer-copy">
          <strong>Every BMW is different.</strong>
          <p>
            Pricing depends on the vehicle, module and service. Send the year, model and requested work so the shop can quote the job accurately.
          </p>
        </div>
        <Link className="button light" href="/booking">
          REQUEST AN ESTIMATE <b aria-hidden="true">→</b>
        </Link>
      </div>
    </section>
  )
}
