export function shopToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function bookingDateLimits(now = new Date()) {
  const min = shopToday(now)
  const [year, month, day] = min.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const max = new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10)
  return { min, max }
}

export function usDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${month}/${day}/${year}`
}
