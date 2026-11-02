# Running WHOPLAYSNOW on Cloudflare (free plan, no VPS)

The VPS version is preserved as git tag `vps-v48` (branch `master`). This branch, `cloudflare`, runs the same site without a server.

## How it works

| Piece | Where it runs | What it does |
|---|---|---|
| Collector (`npm run collect`) | GitHub Actions, every 3 hours | Unchanged. Fetches fixtures and broadcasters into `runtime/`. |
| Static build (`npm run build:static`) | GitHub Actions, after collecting | Starts the **unchanged Express app** in-process and requests every public URL, so every page is exactly what the server produces. Writes `dist/site`. |
| Static assets | Cloudflare (free, unlimited requests) | Serves pages, images, CSS, JS, sitemaps, robots.txt and the schedule feed. |
| Worker (`worker/index.ts`) | Cloudflare (free: 100,000 requests/day, 10 ms CPU per request) | Visitor location, the per-country broadcaster panel on event pages, calendar files, the country-specific channel directory, redirects, 410s for legacy URLs, 404s, and pages beyond the 20,000-file limit. |
| Collector state | One Workers KV key (`runtime-state`) | Archive, caches, the URL registry and sitemap timestamps survive between runs, so URLs never change. |

### What differs from the VPS (and why it is safe)

- **Pages are rendered once for the UK, then localised in the browser.** The browser asks `/api/location` for the visitor's country and re-renders the country-specific parts with the same `core.js` functions the server uses: the schedule board, the event broadcaster panel and the directory rows. Search engines see the UK version plus the "TV channels by country" list on every event page.
- **Content updates every 3 hours, not hourly.** Data refreshes on each run. Labels like "Started" on event pages are as of the last build, while schedule boards still compute them live in the browser.
- **Fixtures far in the future may be served from packs.** Pages beyond Cloudflare's 20,000-file limit live in `/_packs/*.bin`, and the Worker answers them with identical HTML. The soonest, indexable fixtures are always plain files.
- **Collection runs from GitHub's US servers.** A broadcaster source that blocks non-European visitors could return less data than it did from the VPS. Compare the first runs' `scheduleQuality` and `competitionCoverage` logs against the VPS before switching DNS.

## One-time setup

1. **Cloudflare**
   - Create an API token with the "Edit Cloudflare Workers" template, plus **Workers KV Storage: Edit**.
   - Create the state store: `npx wrangler kv namespace create whoplaysnow-state` and note its id.
2. **GitHub** (a private repository works: each run takes about 10–15 minutes, which fits the 2,000 free minutes a month at a 3-hour schedule)
   - Push this branch.
   - Add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and a variable `STATE_NAMESPACE_ID`.
3. **Seed state from the VPS** so URLs and history carry over exactly:
   ```bash
   tar -cz -C /opt/whoplaysnow/sports/data . | base64 -w0 > state.b64
   npx wrangler kv key put runtime-state --path state.b64 --namespace-id <id> --remote
   ```
4. Run the workflow manually (Actions → "Collect and deploy to Cloudflare" → Run). The site goes live at `https://whoplaysnow.<your-subdomain>.workers.dev`.
5. **Verify on workers.dev:** `npx tsx scripts/seo-audit.ts --origin https://whoplaysnow.com --sample 20` checks production URLs. For the preview, open pages manually and compare them with the live site.
6. **Cutover:** in `wrangler.jsonc`, uncomment the `routes` custom-domain entry, remove the DNS records that point to the VPS, and deploy. Keep the VPS running for a week as a rollback (restoring the DNS records switches back).

## Local commands

```bash
DATA_DIR=runtime npm run build:static
```
```bash
npx wrangler dev
```

## Limits to watch

- **Worker requests: 100,000 a day.** Static files do not count. Legacy URL crawling (410s) and event panels do. Watch Workers → Metrics; the paid plan ($5/month) raises this to 10 million a month.
- **Static files: 20,000.** The build enforces this and moves overflow pages into packs automatically.
- **KV writes: 1,000 a day.** Each run uses 1.
