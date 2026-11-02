// Reusing ICU formatters prevents hundreds of native allocations per country
// change when rendering a full international schedule.
type Style = 'time' | 'full' | 'date' | 'day' | 'weekday'
const formats = new Map<string, Intl.DateTimeFormat>()
export function matchDate(value: string | number, zone: string, style: Style, locale = 'en-GB') {
  const key = `${zone}:${style}:${locale}`
  let formatter = formats.get(key)
  if (!formatter) {
    if (formats.size >= 64) formats.delete(formats.keys().next().value!)
    const options: Intl.DateTimeFormatOptions = { timeZone: zone,
      ...(style === 'time' || style === 'full' ? { hour: '2-digit', minute: '2-digit' } : {}),
      ...(style === 'date' || style === 'full' ? { day: 'numeric', month: 'short' } : {}),
      ...(style === 'weekday' || style === 'full' ? { weekday: 'short' } : {}),
      ...(style === 'day' ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
    }
    formatter = new Intl.DateTimeFormat(style === 'day' ? 'en-CA' : locale === 'en' ? 'en-GB' : locale, options)
    formats.set(key, formatter)
  }
  return formatter.format(new Date(value))
}
