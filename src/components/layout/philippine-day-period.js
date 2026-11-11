const philippineHour = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  hourCycle: 'h23',
})
const dayPeriods = [
  { before: 12, label: 'Morning', greeting: 'Good morning', icon: 'sunrise', color: 'text-orange-600' },
  { before: 17, label: 'Afternoon', greeting: 'Good afternoon', icon: 'sun', color: 'text-amber-600' },
  { before: 24, label: 'Evening', greeting: 'Good evening', icon: 'moon', color: 'text-indigo-600' },
]

export function getPhilippineDayPeriod(date = new Date()) {
  const hour = Number(philippineHour.format(date))
  return dayPeriods.find((period) => hour < period.before)
}
