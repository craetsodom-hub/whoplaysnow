# Future schedule audit — 1 November 2026

Production release: **20261101-sports-v41**. Collector completed successfully at 12:54 UTC.

The four-month collector is live. This release improves freshness and coverage; **worldwide broadcast completeness has not been established**.

| Check | Production result |
| --- | ---: |
| Future events | 4,087 |
| Events with a named viewing listing | 3,394 |
| Events with official-source evidence | 3,267 |
| Events needing viewing-listing data | 693 |
| Stale observations (two explicitly postponed fixtures) | 2 |
| Missing structured fixture-source records | 5 |
| Events without a supplied venue | 33 |
| Missing event/channel artwork | 0 |
| Live image URLs checked successfully | 811 |
| Regression tests passed | 144 |

All active fixtures in the current supported window have fresh observations. The two old observations belong to postponed events; their status is preserved, their calendar exports are tentative, and their event URLs are excluded from the future-event sitemap.

## Remaining viewing-listing gaps

A missing record means the guide has not established a current viewing destination. It does not mean the event has no broadcast. Numbered TV allocations are not fabricated from a broadcaster’s competition rights.

| Competition | Future events | Without viewing data |
| --- | ---: | ---: |
| Championship | 252 | 224 |
| League Two | 233 | 108 |
| Scottish Premiership | 105 | 105 |
| Süper Lig | 58 | 58 |
| Greek Super League | 55 | 55 |
| League One | 240 | 38 |
| Brazilian Serie A | 31 | 31 |
| Danish Superliga | 29 | 29 |
| Liga Portugal | 24 | 24 |
| Liga MX | 21 | 21 |

Within seven days, 369 of 432 events have a named viewing listing; 63 still need listing data. Within 30 days, 1,157 of 1,386 have a listing; 229 still need data. The quality report retains event IDs and examples per competition for further investigation.

## Changes and validation

- Expanded the schedule refresh from 30 to 120 days and passed that horizon to the shared-feed normalizer. The source check fetched 518 ESPN schedule slices successfully, with no identity conflicts in the replay.
- Distant source slices refresh every 12 hours. Failed fetches retain original clocks for at most 48 hours and retry on the next collection. Near dates refresh on every collection.
- Every collection now writes `schedule-quality.json`, including 7/30/120-day coverage, source/clock problems, duplicates, and missing artwork. The standalone audit supports `--strict`; it fails while completeness gaps remain.
- Preserved explicit postponements and cancellations. Calendar exports include accurate status, supplied venue, Unicode-safe line folding, and no invented duration. Unconfirmed kickoffs do not become precise structured-data claims.
- Reconciled an MLS competition alias; supplied the reviewed Norwegian 1. Divisjon badge and newly surfaced channel-artwork aliases. The Fox 11 Plus fallback uses its parent FOX network mark; the exact station artwork is still not catalogued. Arizona’s Family aliases use the documented family brand.
- Mobile event headers fit all 756 club names checked at 320/390/600 pixels. White Stan Sport artwork remains visible on light cards.
- All 144 tests passed locally and in the production image. Eight live event-page checks covered future football, NBA, NHL and NFL at mobile/desktop widths. All 811 referenced local image assets returned successful image responses.
- Liverpool–Arsenal retains official beIN SPORTS 1 AR, beIN SPORTS 1 EN, beIN 4K and the reviewed TOD streaming option for Morocco.

The production report still identifies missing viewing records, fixture-source fields and venues. This audit does not certify every future event, country or exact TV channel as complete.
