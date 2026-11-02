// This preference contains a country code only, never account or location data.
export const UTILITY_COUNTRY_KEY = 'whoplaysnow:utility-country:v1'
export function validCountry(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/i.test(value)) return null
  const code = value.toUpperCase() === 'UK' ? 'GB' : value.toUpperCase(), label = new Intl.DisplayNames(['en'], { type: 'region' }).of(code)
  return label && label !== code && !/unknown region/i.test(label) ? code : null
}
export function preferredUtilityCountry(): string | null {
  if (typeof window === 'undefined') return null
  const query = validCountry(new URLSearchParams(window.location.search).get('country'))
  if (query) return query
  try { const stored = validCountry(localStorage.getItem(UTILITY_COUNTRY_KEY)); if (stored) return stored } catch { /* Preferences are optional. */ }
  return validCountry(document.cookie.split('; ').find(value => value.startsWith('region_preference='))?.split('=')[1])
}
export function saveUtilityCountry(country: string) { try { const code = validCountry(country); if (code) localStorage.setItem(UTILITY_COUNTRY_KEY, code) } catch { /* Navigation still works without local storage. */ } }
