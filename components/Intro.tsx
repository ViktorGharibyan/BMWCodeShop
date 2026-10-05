import Link from 'next/link'

export function Intro() {
  return (
    <section className="precision-about" id="about">
      <figure className="precision-about-figure">
        <img src="/about-bmw-blue.png" alt="Blue BMW M3 in natural daylight" width="1536" height="1024" loading="lazy" />
        <figcaption><span>BMW FOCUSED.</span><span>Built around your car.</span></figcaption>
      </figure>
      <div className="precision-about-copy">
        <p className="precision-kicker">ABOUT BMWCODES</p>
        <h2>Technical expertise.<br /><span>Personal attention.</span></h2>
        <p className="precision-about-lead">A specialist approach to the BMW you drive.</p>
        <p>BMWcodes LLC specializes in BMW electronic systems, coding, diagnostics and performance services. From ECU, DME and TCU work to repairs and retrofits, our focus is on your car and the work it needs.</p>
        <div className="precision-about-note"><span>LET’S START WITH YOUR CAR</span><p>Send us your BMW’s year, model and what you’d like to change or fix. We’ll help you with an exact quote.</p></div>
        <Link className="button red" href="/booking">CONTACT US NOW <b aria-hidden="true">→</b></Link>
      </div>
    </section>
  )
}
