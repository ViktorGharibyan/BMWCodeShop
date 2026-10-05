import type { Service } from '@/components/ServiceCard'

export const services: Service[] = [
  {
    type: 'CODING',
    title: 'ADVANCED CODING',
    description: 'BMW coding, module setup and electronic customization.',
    detailTitle: 'Feature activation & module setup',
    bullets: ['Convenience feature coding', 'Module configuration', 'Factory-style BMW customization'],
    result: 'Typical result: hidden features enabled and the vehicle configured the way you want.',
  },
  {
    type: 'TUNING',
    title: 'ECU / TCU TUNING',
    description: 'Performance-oriented software work for supported vehicles.',
    detailTitle: 'Power-focused software work',
    bullets: ['Supported ECU / TCU calibration', 'Performance optimization', 'Driveability-focused setup'],
    result: 'Typical result: sharper response, stronger performance and a cleaner driving feel.',
  },
  {
    type: 'UNLOCK',
    title: 'DME / ECU UNLOCKS',
    description: 'Bench, Femto and other supported unlock solutions.',
    detailTitle: 'Unlock path for supported platforms',
    bullets: ['Bench unlock workflow', 'Femto-supported options', 'Guidance on supported ECUs'],
    result: 'Typical result: the car is ready for the next stage of tuning or calibration.',
  },
  {
    type: 'INSTALL',
    title: 'PERFORMANCE INSTALL',
    description: 'Performance hardware installs and supporting work.',
    detailTitle: 'Hardware + supporting electronic work',
    bullets: ['Performance part installation', 'Supporting coding / setup', 'BMW-focused install workflow'],
    result: 'Typical result: parts installed correctly and matched with the software side when needed.',
  },
  {
    type: 'DIAGNOSTICS',
    title: 'REPAIRS / SERVICE',
    description: 'Diagnostics, maintenance and electronic system repair.',
    detailTitle: 'Diagnosis first, repair second',
    bullets: ['Fault tracing', 'Electronic diagnostics', 'Service and repair support'],
    result: 'Typical result: clear diagnosis, reduced guesswork and a proper plan to fix the issue.',
  },
  {
    type: 'RETROFIT',
    title: 'RETROFITS / MORE',
    description: 'Retrofits, module work and other custom BMW services.',
    detailTitle: 'Retrofits & custom requests',
    bullets: ['Retrofit consultation', 'BMW module-related work', 'Custom project support'],
    result: 'Typical result: OEM-style upgrade or custom solution tailored to the vehicle.',
  },
]
