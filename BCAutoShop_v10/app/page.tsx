import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { Intro } from '@/components/Intro'
import { Services } from '@/components/Services'
import { Estimate } from '@/components/Estimate'
import { Projects } from '@/components/Projects'
import { Contact } from '@/components/Contact'
import { Footer } from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Intro />
        <Services />
        <Estimate />
        <Projects />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
