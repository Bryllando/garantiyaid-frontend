const philippineHour = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  hourCycle: 'h23',
})
const dayPeriods = [
  { before: 4, label: 'Midnight', icon: 'moonStars', color: 'text-indigo-700' },
  { before: 7, label: 'Early morning', icon: 'sunrise', color: 'text-orange-600' },
  { before: 12, label: 'Morning', icon: 'sun', color: 'text-amber-600' },
  { before: 13, label: 'Noon', icon: 'sunHigh', color: 'text-amber-600' },
  { before: 18, label: 'Afternoon', icon: 'sunset', color: 'text-orange-600' },
  { before: 24, label: 'Night', icon: 'moon', color: 'text-indigo-600' },
]

export function getPhilippineDayPeriod(date = new Date()) {
  const hour = Number(philippineHour.format(date))
  return dayPeriods.find((period) => hour < period.before)
}
