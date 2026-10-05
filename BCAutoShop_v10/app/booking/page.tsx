import { Suspense } from 'react'
import { BookingForm } from '@/components/BookingForm'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'

export default function BookingPage() {
  return (
    <>
      <Header />
      <main className="booking-page">
        <div className="booking-intro">
          <p className="booking-kicker">BMWCODES LLC</p>
          <h1>
            BOOK YOUR
            <br />
            <span>BMW.</span>
          </h1>
          <p>
            Tell us the vehicle, service and preferred date. The shop will review your request and get back to you.
          </p>
          <a href="tel:+15162465128">+1 (516) 246-5128</a>
        </div>
        <Suspense fallback={<p role="status">Loading booking form…</p>}>
          <BookingForm />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
