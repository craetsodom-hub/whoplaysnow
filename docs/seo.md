# Search acquisition system

How WHOPLAYSNOW gets fixtures discovered, indexed and ranked, and how to tell whether it is working. Audit date: 2 November 2026.

## What the audit found

| Finding | Impact | Resolution |
|---|---|---|
| About 807k legacy film/TV URLs known to Google (`/movie/…`, `/actor/…`, `/sg/actor/…`, `/gb/streaming/…`) plus 61 legacy sitemaps (`/sitemap/catalog-*.xml`) still submitted in Search Console. Two-segment ones (`/movie/550`) hit the event route and rendered "Match not found" 404s. | Crawl budget spent on dead URLs; the "movies and TV" association lingers in results. | `lib/legacy.ts`: every legacy pattern, including country prefixes and old sitemap paths, returns **410 Gone** with `X-Robots-Tag: noindex`, before any sports route. |
| One flat 18,933-URL sitemap with no `lastmod`. | Google cannot tell which fixtures changed, and Search Console cannot show indexing per page type. | Sitemap index with `pages`, `competitions`, `teams` and one `events-YYYY-MM` file per kickoff month. `lastmod` = when visible content changed (collector fingerprint), not the hourly heartbeat. |
| Generic titles and descriptions (`X vs Y — where to watch`), and the same title for every repeat meeting (3,022 repeated titles). | Low click-through rate; duplicate titles. | Title: `Home vs Away — TV channel & where to watch (3 Nov 2026)`. Description names the kickoff in UK time and real verified channels by country (venue country first). |
| The event H1 held only the home team; the away team was an H2. | Weak on-page match for the query. | One H1 covering the whole matchup; the layout is unchanged. |
| Event pages linked to `/?q=…` (noindex) and to thousands of `?country=` variants. | Link equity leaked; crawl budget wasted. | Links point to competition and team pages and the next fixtures. `robots.txt` keeps crawlers off the country, search, saved-view and competition-filter URL variants. |
| No team pages. | No landing page for "Arsenal TV schedule" or "Man United match on TV" searches. | `/teams/{sport}/{team}` for teams with 2 or more upcoming fixtures. Identity separates sport, women's teams and age groups (Arsenal vs Arsenal Women; Real Madrid football vs basketball; Spain vs Spain U17). |
| Competition pages capped at 40 fixtures and ignored the official rights data already collected (F1 in 51 countries, Premier League in about 90). | Competition pages could not answer "where to watch Formula 1 in Spain". | A "Where to watch {competition}" section built from current official rights, falling back to channels from match listings (labelled as such). Every later fixture is linked. |
| Finished or removed fixtures returned 404, and matchups that recur lost their URL history. | Lost signals on every recurring fixture. | A retired fixture URL returns a 301 to the next meeting of the same matchup in the same competition; a finished one-off returns 410. |
| No signal to retire finished fixtures from results. | Stale results, followed by 404s. | `unavailable_after` = kickoff + 2 days, a directive Google supports. |
| Structured data was a bare `SportsEvent`. | No machine-readable answer to "where to watch". | A `SportsEvent` graph with teams (linked to team pages), venue and images, plus one `BroadcastEvent` → `BroadcastService` (with `areaServed` country) for each verified listing. Also `Organization`/`WebSite` on the home page and breadcrumbs everywhere. |
| IndexNow was implemented but never called, and its key file returned 404. | Bing and Yandex discovery was slow. | The key is served at `/{key}.txt`. The collector submits changed upcoming fixtures after each run; the first run only seeds state. |

## Audit of 13 November 2026

Search Console (domain property `whoplaysnow.com`, 16 months, no filters, data to 10 Nov): 0 clicks, 32 impressions, 1 indexed page (the home page). Page indexing (updated 9 Nov): 19,929 "Crawled – currently not indexed", almost all legacy `/movie/` and `/actor/` URLs; 538 server errors from the old host (before 23 Oct). Crawl stats: 2.42K requests in 90 days, 37% 5xx from the old site, and since 2 Nov Googlebot fetched only the home page and images. The sitemap index was last read on 2 Nov, when it still listed the legacy catalogue (655,332 URLs); the new child sitemaps had never been fetched, so event, team and most competition URLs were "unknown to Google". No manual actions or security issues. Bing had read the new index (4 Nov, 13.1K URLs) and indexed the home and competition pages, but event pages that never changed after the first collection were "not discovered": IndexNow only sent edits.

Fixed in code:

| Finding | Fix |
|---|---|
| The same fixture from two providers was published twice (TheSportsDB records without participant objects, or a competition naming variant), each copy self-canonical and in the sitemap; the second copy took a dated URL. 11 pairs live, e.g. `/uefa-nations-league/serbia-vs-germany` and `…-2026-11-13`. | `mergeOfficialMatches` matches on the title's sides when participants are missing; `International Friendlies` and `Major League Soccer - Cup Playoffs` reconcile with their canonical names. The merged identity's URLs become 301 aliases of the surviving page (`mergedIds` → route registry). |
| Scheduled collection fired about 3 times a day instead of 8 (GitHub drops scheduled runs), so fixtures and channels were up to 13 h late. | Schedule at :17 and :47 every hour. |
| IndexNow never announced pages that were unchanged since they were first seen, nor URLs that stopped being pages. | Seo state stores the fingerprint IndexNow accepted; every indexable version is sent once (first run after this change backfills), plus merged/retired paths. |
| The post-deploy crawl audit sent a Googlebot user agent from GitHub runners; Cloudflare answered 403 and the audit failed every run without checking anything. | Honest audit user agent. |

## Country watch pages

`/competitions/{competition}/{country}` ("Where to watch Premier League in the United States") exist only when the country has published season rights for the competition or channels in at least 3 upcoming match listings (`lib/watch-pages.ts`). Each lists the rights holders, every upcoming fixture with that country's channels and kick-off times in its time zone. They are linked from the competition's rights list and from each event's "TV channels by country", and listed in `sitemap-watch.xml` (271 pages on 13 Nov 2026).

## Event lifecycle (automatic)

`lib/event-seo.ts` → `eventIndexing()` decides each state on every request and every collection:

1. **Published, not yet indexable.** A fixture more than 10 days away, with no verified listing, outside the priority competitions: `noindex,follow`, not in any sitemap. This keeps about 8,400 thin pages (mostly NCAA fixtures far ahead) from diluting site quality.
2. **Indexable.** It has a verified listing, OR it is 10 days or less from kickoff, OR it is in a priority competition (`competitionPriority` in `public/core.js`). The fixture enters its month sitemap. Its `lastmod` moves whenever kickoff, status, venue, names or the set of channels per country changes, and IndexNow is notified.
3. **Live.** The page stays in the sitemap until 12 hours after kickoff.
4. **Finished.** `unavailable_after` (kickoff + 2 days) retires the page from results while it is still served for 7 days.
5. **Removed.** The URL returns a 301 to the next meeting of the same matchup if one exists, otherwise 410.
6. **Postponed or cancelled.** Stays indexable with the correct `eventStatus` and an explicit description. A postponed fixture drops `unavailable_after` until a new date exists. **Schedule to be confirmed** (the observation is more than 48 hours old) means `noindex` and no start date in structured data.

## Monitoring

- `npx tsx scripts/seo-audit.ts --origin https://whoplaysnow.com --sample 20 --output audit.json` crawls every sitemap with a Googlebot user agent and samples the soonest plus random URLs. It fails on non-200 responses, noindex pages in a sitemap, canonical mismatches, H1 count other than 1, invalid JSON-LD, event pages without `SportsEvent`, pages listed past `unavailable_after`, and legacy URLs that do not return 410. It warns on duplicate titles and missing `lastmod`. Run it after every deploy.
- The collector logs `{"event":"seoState",...}` and `{"event":"indexNow",...}` on each run.

## Search Console actions (need account access)

1. Keep `https://whoplaysnow.com/sitemap.xml` submitted. It is now an index, and Google discovers the child sitemaps from it.
2. Remove the 60 legacy child sitemaps (`/sitemap/base.xml`, `/sitemap/catalog-000001…000060.xml`). They now return 410.
3. Optional: use the Removals tool with the `https://whoplaysnow.com/movie/` and `/actor/` prefixes to hide legacy results quickly while the 410s are processed. Removals hide results for about 6 months; the 410s make the removal permanent.
4. Resubmit `sitemap.xml` whenever Search Console's "Last read" is older than a few days. Request indexing only for a handful of imminent, high-demand fixtures; the sitemap `lastmod` and internal links handle the rest. The Indexing API does not apply to this content.

## What to measure (weekly)

| Metric | Source | Healthy direction |
|---|---|---|
| Indexed / submitted per `sitemap-events-YYYY-MM` | GSC → Sitemaps → see page indexing | Current month above 60% and rising |
| "Crawled – currently not indexed" and "Discovered – not indexed" for sports URLs | GSC page indexing, filtered by sitemap | Falling |
| Legacy "Not found (404)" and "Server error" counts | GSC page indexing | Steady decline to zero; 410s should move into "Not found" and then disappear |
| Crawl requests to sports URLs vs legacy URLs | GSC → Settings → Crawl stats → by response | 410 share falling, 200 share rising |
| Impressions and clicks on `vs` / `tv channel` / `where to watch` queries | GSC performance, query regex `(vs\|v\|tv\|channel\|watch)` | Rising; impressions should peak 0–3 days before kickoff |
| Average position on event pages, in the week before kickoff | GSC performance, page filter `/[^/]+/[^/]+-vs-` | Improving |
| Team page and competition page clicks | GSC performance, page filter `/teams/` and `/competitions/` | Rising |
| `seo-audit.ts` failures | Script exit code | 0 |
