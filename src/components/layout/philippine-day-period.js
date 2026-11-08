const philippineHour = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  hourCycle: 'h23',
})
const dayPeriods = [
  { before: 4, label: 'Midnight', greeting: 'Magandang gabi', icon: 'moonStars', color: 'text-indigo-700' },
  { before: 7, label: 'Sunrise', greeting: 'Magandang umaga', icon: 'sunrise', color: 'text-orange-600' },
  { before: 12, label: 'Morning', greeting: 'Magandang umaga', icon: 'sun', color: 'text-amber-600' },
  { before: 13, label: 'Noon', greeting: 'Magandang tanghali', icon: 'sunHigh', color: 'text-amber-600' },
  { before: 18, label: 'Afternoon', greeting: 'Magandang hapon', icon: 'sunLow', color: 'text-orange-600' },
  { before: 19, label: 'Evening', greeting: 'Magandang gabi', icon: 'sunset', color: 'text-orange-700' },
  { before: 24, label: 'Night', greeting: 'Magandang gabi', icon: 'moon', color: 'text-indigo-600' },
]

export function getPhilippineDayPeriod(date = new Date()) {
  const hour = Number(philippineHour.format(date))
  return dayPeriods.find((period) => hour < period.before)
}
