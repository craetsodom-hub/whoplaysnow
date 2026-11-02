# Broadcast coverage operations

Last implementation review: 29 October 2026.

## Verified club services

The request-time projector in lib/efl-club-services.ts uses data/efl-club-services.json. Each record contains the current service brand, club aliases, official viewing link and locally stored club crest. The EFL official team directory and the actual club subscription pages were both reviewed. Only 21 clubs with an identifiable current service and an overseas video offer were added. Broken directory links and generic video libraries were excluded.

The 2026/27 EFL policy permits every League One and League Two league fixture internationally, including TV selections. This does not apply to the Championship or cups. UK, Ireland, Isle of Man and Channel Islands are excluded. Club matching, division, season, fixture freshness and review expiry all restrict publication. Country-by-fixture duplication is avoided by projecting supported territories when requested. The schedule includes a France-labelled overseas fallback when the selected country is excluded.

## ESPN Netherlands

The default upcoming page contains only one calendar day's programmes. The collector now checks seven explicit dates in Europe/Amsterdam, in batches of at most three requests. It extracts public JSON without executing page scripts, matches teams, competition and kickoff, and publishes only explicit NL_ESPN channel codes. Highlights, replays and programmes at a different kickoff are rejected. Duplicate fixture provider records are reconciled before matching.

Each dated page retains its own observation time and exact source URL. Refreshes are attempted after three hours; evidence expires after twelve hours. A failed request never refreshes its clock.

The production host returned HTTP 202 with an empty body during this review, while normal public requests from the review environment returned the official HTML. A manually reviewed seven-day snapshot was installed preserving its original clocks. This is a temporary bridge; automatic production access to that source is unresolved. Do not describe the source as automatically healthy or renew its evidence without another successful official retrieval.

## Coverage status

The live audit after the club-service release found 4,120 upcoming events. Adding these services supplied a viewing destination to 298 previously empty events, reducing the empty count from 1,139 to 841. Within the next seven days, the count fell from 91 to 75. The seven dated ESPN pages subsequently matched 20 fixtures to 22 exact channel listings; these fixtures already had some streaming destinations. Counts change with the schedule and expiry and must be re-audited before making any completeness claim.

Full worldwide event/channel coverage is not established. Preserve fixture visibility and original evidence clocks; do not invent numbered channels, duplicate destinations to fill three slots, infer match carriage from league rights, or hide uncovered fixtures to improve coverage metrics.

## Final live verification: release sports-v28

The collector published a new snapshot at 2026-10-29T21:52:41.151Z. The public API returned 22 exact ESPN Netherlands listings across 20 fixtures, and the Mexico City Grand Prix returned Sky Sports F1 for GB/IE and Apple TV for US. All 104 regression tests passed locally and in the release container. There were 4,120 upcoming events, 840 without any current viewing destination, including 74 within seven days. These are incomplete coverage counts, not a production-completeness claim.

The Formula 1 rules use explicit all-race commitments from the broadcaster, not its mere presence on a league rights list. Sky Sports F1 retains competition-wide evidence level B with channel precision; Apple TV retains service precision. Both are restricted to the reviewed 2026 season and stated territories.

The ESPN integration keeps reconciled matching identities separate from archived publication identities. It merges only ESPN evidence back into the original canonical record, preserving fixture metadata and observation time. Unmatched normalized records are never republished through this stage. This prevents the identity conflict caught during live collection.

## Viewing country and presentation (sports-v29)

Public pages default to the current Cloudflare IP country. Legacy saved country cookies/localStorage and previously auto-appended country query parameters no longer override location. Deliberate page overrides use both country=XX and countryMode=manual; the Automatic option removes them. Country-specific API requests continue to accept country=XX. Keep the manual marker on generated links that intentionally open another territory. Location responses and personalized HTML/API responses are private and not cached.

Broadcaster sorting is shared across schedule previews, local listings, international alternatives and the channel directory. Local official listings lead, then local guide listings, followed by overseas official and guide listings. Within those groups a curated prominence policy ranks provider brands, with exact channel feeds before the same brand service and natural channel-number ordering. This is an editorial ordering, not measured audience data. Overseas duplicates are grouped by channel with country details, three initial alternatives and a more control.

Every channel logo uses a 64 by 36 pixel frame with contain sizing; names remain one line with ellipsis and a full-name title. Isolated browser checks covered automatic mode, old URLs/preferences, manual selection, travel, ranking, more expansion, and widths 320/390/768/1440 without horizontal overflow.

## Home-page preview and typeface (sports-v30)

The preview now reserves its opening slots for one current-country listing, one Arabic-region listing and one UK listing, taking the best available distinct channel for each. It then rotates remaining local/Arabic/UK/world options under more. Unavailable categories are not invented, and a channel already selected is not duplicated. Arabic eligibility uses a verified Arabic audio record, an explicit Arabic channel identifier, or a recognized regional broadcaster in an Arabic market; explicitly English/French feeds are excluded from regional classification. Regional broadcaster identity does not assert an unverified commentary language.

Request-time global service projections include the selected country, Morocco, UK and France, subject to each provider's existing territory exclusions. The API preserves language evidence for consistent client/server ordering.

The old Barlow font asset was deleted. Chakra Petch is self-hosted in regular, semibold and bold weights under the included SIL license, with source/checksum details in data/typeface-provenance.json. Club names, channel names, headings, controls, the favicon and the share-card artwork were updated. Desktop viewing columns receive about 55 percent of the flexible row space; phones and narrow tablets show the viewing list across the full row beneath the teams. Browser checks at 320/390/600/601/768/900/901/1024/1180/1440/1920 confirmed the tested channel names were not clipped, no horizontal overflow, and the real font loaded. The regression suite passes 111 tests.


## Strict preview slots (sports-v31)

The preview and the expanded alternatives are now separate lists. A missing local/Arabic/UK slot cannot be filled by Australia or another unrelated market. Remaining channels are retained under more even when fewer than three priority channels exist. When the sources have no local entry, the preview says so; it does not imply that a foreign listing is available locally. A single channel covering multiple priority regions is displayed once with its country grouping.

The country selector displays the resolved country name without an Automatic prefix. Its location detection and manual override behavior are unchanged. Regression tests cover all supported countries, absent priority slots, overlapping territories and source-order independence.


## Feed editions and audio labels (sports-v32)

Channel grouping now includes the edition and any source-identified audio. Identically named beIN channels in MENA, France and Australia stay separate. Reviewed shared edition groups are beIN MENA, Sky Sports UK/Ireland and the named NBA League Pass/NHL.TV/MLS Season Pass global services; other channels retain their territory edition. Same-country verified audio variants also remain separate in local listings and the channel directory.

Display names retain explicit source suffixes such as AR/EN/FR/ES. Audio codes backed by event-audio or feed-audio evidence are appended when absent from the name. A country alone never establishes language; unspecified records show the edition and Audio not specified. The beIN official FAQ (https://www.bein.com/en/faqs/) identifies its separately named EN and FR channels; it does not establish a language for every event or unqualified channel record. No new match availability or commentary language was inferred from this presentation change.

116 regression tests pass. Layout checks at eleven widths from 320 to 1920 pixels preserve the tested full channel names.


The sports-v33 follow-up marks the reviewed NBA, NHL and EFL international services in the request-time projection. Those shared services group across eligible countries; their country availability list stays intact. The compact API carries the same edition marker so server and browser grouping agree. Linear regional feeds and distinct source-identified audio remain separate. This avoids repeating NHL.TV and club subscriptions once per territory. All 117 regression tests pass.


## Compact broadcast cards (sports-v34)

Broadcaster cards now contain an unframed, larger logo and one title. Source-identified language codes appear in the title; records without such evidence use their regional edition in parentheses. Country does not become an invented commentary-language code. Per-card metadata and outbound broadcaster/listing buttons are removed from the rendered UI while evidence stays in the source data. More broadcasters shows three compact cards and expands the rest. Local official and guide sections remain separate. Mobile match actions occupy one grid row including the saved state. White Thmanyah artwork is rendered dark against the light page without adding a frame.

118 tests pass. Six-width browser checks from 320 to 1440 verify single-row actions, logo/name alignment, compact cards and no metadata/buttons or horizontal overflow.


## Additional official service coverage and kickoff retention (sports-v35)

The new reviewed catalog adds country-scoped, all-match service evidence for NFL Game Pass (2026 international season, excluding blackout/restricted markets), Disney+ UWCL in its licensed European/Latin American/APAC territories, Spanish-language ESPN Deportes UWCL in the US, NWSL+ in markets without announced exclusive partners, DAZN Spain's explicitly complete football/motor/ACB packages, Premier Sports RLWC in its 129 global + 22 Asian + UK/IE/CA markets, and the UK Premier Sports URC/Champions Cup subscription. Each rule carries an official source, review expiry, sport, competition, season/date interval, and explicit territories. Selected rights (LaLiga top division, Portuguese/Eredivisie selections, NBA selections and NFL basic bundles) are not promoted into all-event rules. Known blackouts and exclusive partner markets are withheld from blanket service rules.

Request-time projection keeps exact channels and makes the service coverage immediately available without rewriting fixtures. It includes representative ES/US/AU options alongside local/Arabic/UK/French markets. Match detail pages expand the reviewed eligible territories and group shared services. Verified global services now remain present for eight hours after kickoff rather than vanishing at the scheduled start. Existing source freshness and cancellations still suppress unsupported coverage.

The negative country-data message is removed for every country. If no preferred region has a listing, actual named alternatives are visible with their broadcast region in the title. This is not a claim that those foreign subscriptions work in the selected country. All titles now include region qualifiers, including international services, so an EN language label cannot conceal a foreign-only option.

123 tests cover all listed territories per rule, scope exclusions, expired evidence, wrong seasons and cancelled/stale fixtures, preservation of exact channels, idempotence, and kickoff retention. scripts/audit-broadcast-coverage.mjs provides a read-only per-country gap report from the current API. Missing data remains a measurable gap; the implementation does not claim universal verified coverage.


## Domestic service evidence and recorded fixture allocations (sports-v36)

Current DAZN Belgium 2026/27 documentation explicitly establishes all-match Jupiler Pro League, LaLiga, Serie A and Ligue 1 coverage. Current Sky Austria documentation establishes all domestic ADMIRAL Bundesliga matches and streaming through Sky Go. Both rules stay inside their documented countries; split German Bundesliga/UEFA packages and selected NBA/NFL content are not promoted into full-season coverage. The request projection includes BE/AT representatives so these legitimate alternatives are discoverable from other markets.

Past pages retain only contemporaneous official level-A fixture allocations, labelled Recorded TV Listings/Past scheduled start. Eligibility requires a fixture observation near kickoff, an official event record checked within the kickoff window, original evidence expiry reaching kickoff, and an event within seven days. Cancelled/postponed/unconfirmed fixtures, expired future listings, generic all-event subscriptions, and guide-only records cannot become recorded official listings. Historical expiry timestamps remain unchanged. This specifically restores archived LaLiga and beIN allocations on the Villarreal–Espanyol page without misrepresenting them as live availability. 126 tests pass.

## Broadcaster identity and artwork — 1 November 2026

Channel names have no parenthesized suffix. Reviewed beIN regional feed identities use AR, EN or FR, and XTRA 1–2 use the provider's AR/EN label. These identify the feed edition; they do not claim that every programme has a single audio track. Programme audio evidence remains separate. The reviewed identity catalog has a review deadline and never changes event availability or creates a new channel allocation.

Artwork overrides match exact channel aliases and territories. Team-operated services can use the owning team mark, with that choice recorded in the artwork catalog. Each downloaded asset retains source provenance and a SHA-256 hash. Normalized SVG viewports embed the original raster artwork and crop empty outer padding without stretching, recoloring or generating a replacement mark. Channel logo slots are consistently 88 × 48 CSS pixels, with no frame.

## beIN programme title recovery — 1 November 2026

The first-party EPG uses “English Premier League” in programme titles. The previous title parser accepted only “Premier League”, dropping those programme assignments before matching. Exact full-name aliases now normalize to the competition while the independent category and season checks remain mandatory. Equivalent French Ligue 1 and German Bundesliga aliases are included. Arabic and English feeds remain separate exact channel assignments. No match allocations are seeded by tests or hardcoded into production.

Official-schedule cache version 4 triggers a fresh discovery after this parser update. A partially failed adapter retains fresh usable candidates and previous candidates in separate batches with their original verification clocks. Expired evidence is pruned; a failed fetch never renews the previous verification timestamp.

The source uses both “v” and “vs” as team separators. Both spellings, including the optional terminal full stop, now follow the same exact identity and programme-window checks.

The official beIN rights renewal explicitly confirms all 380 Premier League matches each season through 2027/28 and all PL content on TOD. The reviewed service catalog therefore includes TOD by beIN for the existing documented MENA footprint. This provides a verified streaming destination when a future numbered TV allocation is not yet available. It never creates a numbered channel or adds local availability outside that footprint.

Everton–Coventry on 6 November was also omitted because its official slots have 5:30 and 16:15 durations. Both first-party editorial fields give the same teams, Premier League season and explicit 20:00 GMT kickoff. Those corroborated fields now produce exact kickoff candidates, with a consistent MECCA offset, valid calendar date and a programme start within 90 minutes before kickoff. The long interval is never used as a broad matching window. Conflicting editorial values fail closed.


## Full supported future-calendar refresh — 1 November 2026

The production collector now requests 120 days instead of 30. The shared feed normalizer receives that same horizon; it no longer truncates non-ESPN sports to its default seven-day window. The original public horizon and source rules still apply: a published future date is not proof of a final kickoff, and upcoming events are not assumed to have announced TV channel assignments months in advance.

ESPN dates more than 30 days away use a versioned per-date/per-month cache with a 12-hour refresh interval. Near dates continue to fetch on each collection. Failed distant slices retain their original checkedAt for at most 48 hours, report a failed source, and retry at the next collection. Successful empty or changed responses replace their slice. Cache hits never renew fixture or broadcast clocks. Concurrent requests remain capped at four.

Every collection writes schedule-quality.json with the 7/30/120-day counts, stale fixture observations, missing viewing destinations, per-competition examples, per-country listing counts, duplicate identities, malformed evidence and missing artwork. Run the same read-only report with `node --import tsx scripts/audit-future-schedule.ts --snapshot /data/schedule.json --output /data/schedule-quality.json`; `--strict` exits nonzero for remaining data/coverage gaps. Reporting a gap neither hides its fixture nor fabricates a viewing destination.

The MLS alias American Major League Soccer normalizes before reconciliation and decoration. Norwegian 1. Divisjon gets its source-identified league badge; the exact French Canal+ France alias gets the existing Canal+ network mark. Artwork evidence is recorded in the catalogs.

Calendar downloads now include confirmed/tentative/cancelled status and the source venue when supplied, escape property injection, and fold Unicode lines at 75 octets. They do not invent an end time or duration. Unconfirmed kickoffs are omitted from search structured data; cancelled and postponed match pages are noindex and excluded from the future-event sitemap.

The long-calendar source check fetched 518 schedule slices successfully and accepted 4,080 fixtures. A local replay against the prior production snapshot found no identity conflicts and reduced stale observations from 2,550 to two explicitly postponed records. These are source-retrieval and freshness checks, not proof of worldwide channel completeness. Explicit postponements/cancellations now survive an old fixture clock instead of being relabelled as generic schedule confirmation. Newly surfaced local US station aliases use reviewed station/owning-network artwork without changing territorial or match evidence.

Mobile event headers stack crest/name rows so full club names fit naturally. Browser checks cover all 756 current club names at 320/390/600 pixels; a targeted CSS treatment makes the source-provided white Stan Sport SVG visible on light channel cards.


## Competition/event canonical URLs — sports-v42

Public event URLs now use `/{competition}/{event-name}`, including `/premier-league/liverpool-vs-arsenal`. Team fixtures use the actual home and away participant names; non-team events use the source event title. The same shared function drives server/browser schedule links, directories, calendar descriptions, canonical tags, Open Graph, structured data and sitemaps. Provider identifiers remain internal and are retained only for resolving legacy links.

A durable `event-routes.json` registry reserves published paths. Separate meetings with the same competition and participants use a date suffix; same-day repetitions receive a numeric suffix if necessary. Input order and source changes do not reassign a published URL to a different event. Corrected competition/team names and dated reschedules preserve the previous paths as permanent redirect aliases. Paths stay reserved after an event leaves the rolling public snapshot.

The deployment seeds this registry from the existing schedule before starting the new web container. The collector updates it atomically for new fixtures. Existing `/matches/{title}--{provider-id}` URLs resolve by their original identity and return a 301 to the clean canonical URL, preserving valid viewing-country overrides. Unknown events and incorrect competition paths return 404. The collector quality audit detects duplicate public paths.

Request-time country projections now share the existing 15-second snapshot window with a maximum of eight country entries. Snapshot updates invalidate them; country results remain separate. HTTP checks cover all 62 competitions in the local snapshot (4,546 unique event URLs), plus a JP/CN/JP sequence verifying country isolation. Browser navigation from legacy URL to the clean page and from the homepage passes with no script errors.


## Clean action labels — sports-v43

Header navigation uses Schedule and Saved Events. The saved view, empty state, FAQ and notifications use the same event terminology. Save controls use a shared vector bookmark with an outlined unsaved state and filled saved state. Event-page actions show Save/Saved, Calendar and Share with matching vector icons; accessible names retain the full action and event title. Directory country forms use Apply. Calendar and share behavior remains intact.

Save buttons synchronize after reload, across pages, between browser tabs and when returning through browser history. Mobile event actions remain on one line with 44-pixel heights. Four-width browser checks (320/390/768/1440) verify labels, icon presence, layout, saved-list removal, persistence, cross-tab updates and copied links. The existing 149-test regression suite passes.


## Aligned channel artwork — sports-v44

Channel artwork uses left-center positioning inside the existing 88 by 48 pixel slot. Centered object positioning had made square logos appear indented relative to wide marks even though their image elements shared a left edge. Official listings, additional TV listings, expanded alternatives, homepage previews and channel directories now share the left-aligned artwork rule. Event broadcaster cards use an explicit 88-pixel logo column plus a 12-pixel gap and flexible name column. Missing-artwork placeholders reserve the same width, preventing names from moving when an image cannot load. Artwork proportions, unframed presentation, channel identity and broadcaster data are preserved.
