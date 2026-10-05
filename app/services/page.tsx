import { Contact } from '@/components/Contact'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Services } from '@/components/Services'

export default function ServicesPage() {
  return (
    <>
      <Header />
      <main className="subpage">
        <Services />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
