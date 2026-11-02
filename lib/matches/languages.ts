import type { Broadcast } from './feed.ts'

export const MATCH_LANGUAGE_OPTIONS = [
  { code: 'all', label: 'All languages' },
  { code: 'ar', label: 'Arabic' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
] as const

export type MatchLanguage = typeof MATCH_LANGUAGE_OPTIONS[number]['code']
export const MATCH_LANGUAGE_STORAGE_KEY = 'whoplaysnow-match-language'

export function validMatchLanguage(value: unknown): MatchLanguage | null {
  const code = String(value ?? '').trim().toLowerCase()
  return MATCH_LANGUAGE_OPTIONS.some(option => option.code === code) ? code as MatchLanguage : null
}

export function matchLanguageLabel(code: string, locale = 'en') {
  if (code === 'all') return 'All languages'
  try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code.toUpperCase() } catch { return code.toUpperCase() }
}

export function normalizeBroadcastLanguages(value: unknown): string[] {
  const explicit = (Array.isArray(value) ? value : []).map(item => String(item ?? '').trim().toLowerCase())
    .filter(code => /^[a-z]{2}$/.test(code)).filter((code, index, all) => all.indexOf(code) === index).slice(0, 8)
  return explicit
}

export function broadcastMatchesLanguage(broadcast: Broadcast, language: MatchLanguage) {
  return language === 'all' || broadcast.languages.includes(language)
}

export function preferredMatchLanguage(_available: string[] = []): MatchLanguage {
  try {
    const saved = validMatchLanguage(localStorage.getItem(MATCH_LANGUAGE_STORAGE_KEY))
    if (saved) return saved
  } catch { /* The all-languages view remains a safe default without browser storage. */ }
  return 'all'
}

export function saveMatchLanguage(language: MatchLanguage) {
  try { localStorage.setItem(MATCH_LANGUAGE_STORAGE_KEY, language) } catch { /* Navigation still works without local storage. */ }
}
