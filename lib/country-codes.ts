import { toIso2Region } from './region.ts';

function toSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildLegacyCountryNameToIsoCodeMap(): Readonly<Record<string, string>> {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const entries = new Map<string, string>();

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const iso2 = String.fromCharCode(first, second);
      const label = displayNames.of(iso2);

      if (typeof label !== 'string') continue;
      const cleanLabel = label.trim();
      if (!cleanLabel) continue;
      if (cleanLabel.toUpperCase() === iso2) continue;
      if (/unknown region/i.test(cleanLabel)) continue;

      const slug = toSlug(cleanLabel);
      if (!slug) continue;

      if (!entries.has(slug)) {
        entries.set(slug, iso2.toLowerCase());
      }
    }
  }

  const aliases: Array<[string, string]> = [
    ['uk', 'gb'],
    ['great-britain', 'gb'],
    ['united-kingdom', 'gb'],
    ['usa', 'us'],
    ['united-states-of-america', 'us'],
    ['uae', 'ae'],
    ['south-korea', 'kr'],
    ['north-korea', 'kp'],
  ];

  for (const [legacyCountryName, iso2] of aliases) {
    entries.set(legacyCountryName, iso2);
  }

  return Object.freeze(
    Object.fromEntries(Array.from(entries.entries()).sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })))
  );
}

export const LEGACY_COUNTRY_NAME_TO_ISO_CODE = buildLegacyCountryNameToIsoCodeMap();

export function toIsoCountryCode(input: string | null | undefined): string | null {
  const slug = toSlug(typeof input === 'string' ? input : '');
  if (!slug) return null;

  const resolvedFromRegion = toIso2Region(slug);
  if (resolvedFromRegion) return resolvedFromRegion.toLowerCase();

  const directMatch = LEGACY_COUNTRY_NAME_TO_ISO_CODE[slug];
  if (directMatch) return directMatch;

  return null;
}

export type LegacyMovieSlugResolution = {
  idSlug: string;
  legacyCountryName: string;
  isoCode: string;
};

export function resolveLegacyMovieSlugSegment(input: string): LegacyMovieSlugResolution | null {
  const normalized = toSlug(input);
  if (!normalized) return null;

  let searchFrom = normalized.length;

  while (searchFrom > 0) {
    const separatorIndex = normalized.lastIndexOf('-', searchFrom - 1);
    if (separatorIndex <= 0) return null;

    const idSlug = normalized.slice(0, separatorIndex);
    const legacyCountryName = normalized.slice(separatorIndex + 1);

    if (!idSlug || !legacyCountryName) {
      searchFrom = separatorIndex;
      continue;
    }

    if (!/^\d+(?:-[a-z0-9-]+)?$/.test(idSlug)) {
      searchFrom = separatorIndex;
      continue;
    }

    const isoCode = toIsoCountryCode(legacyCountryName);
    if (isoCode) {
      return {
        idSlug,
        legacyCountryName,
        isoCode,
      };
    }

    searchFrom = separatorIndex;
  }

  return null;
}
