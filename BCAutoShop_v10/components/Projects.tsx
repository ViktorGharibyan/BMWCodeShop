import { SectionTitle } from './SectionTitle'

export function Projects() {
  return (
    <section className="projects section" id="projects">
      <SectionTitle>
        RECENT
        <br />
        <span>PROJECTS.</span>
      </SectionTitle>

      <div className="project-content">
        <p>Real BMW coding and diagnostic results from BMWcodes LLC.</p>
        <a className="button red" href="https://www.instagram.com/bmwcodes" target="_blank" rel="noreferrer">
          VIEW MORE ON INSTAGRAM <b aria-hidden="true">→</b>
        </a>
      </div>

      <div className="work-gallery">
        <figure>
          <img src="/work-zero-faults.jpeg" alt="BMW iDrive notifications screen with no active faults" />
          <figcaption>Zero Faults / Errors<small>BMW iDrive · System status / Diagnostics</small></figcaption>
        </figure>
        <figure>
          <img src="/work-notifications.jpeg" alt="BMW digital instrument cluster with a clear dash" />
          <figcaption>Clear Dash<small>BMW digital cluster · Dashboard diagnostics</small></figcaption>
        </figure>
        <figure>
          <img src="/work-cluster.jpeg" alt="BMW navigation screen working properly" />
          <figcaption>Navigation System<small>BMW iDrive · Navigation / System setup</small></figcaption>
        </figure>
      </div>
    </section>
  )
}
