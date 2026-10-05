import Link from 'next/link'
import { SectionTitle } from './SectionTitle'

export function Estimate() {
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
            Your estimate depends on the vehicle, module and service. Send the year, model and requested work so the shop can quote the job accurately.
          </p>
        </div>
        <Link className="button light" href="/booking">
          REQUEST A QUOTE <b aria-hidden="true">→</b>
        </Link>
      </div>
    </section>
  )
}
