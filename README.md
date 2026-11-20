# Daily Jobs Digest

Scrapes new job postings each day from four boards and consolidates them into a
per-day digest (web dashboard + downloadable Excel, one worksheet per source):

| Source | Method |
|---|---|
| [Conservation Job Board](https://www.conservationjobboard.com/) | HTML, date-sorted listing pages |
| [Idealist](https://www.idealist.org/) | The site's own public Algolia search API |
| [NAFSN](https://members.foodsystemsnetwork.org/members/classifieds5.php?org_id=NAFS) | HTML classifieds table |
| [WildTeam](https://jobs.wildteam.org.uk/?place=United+States) | Job data embedded in the public listing page (Next.js payload) |

WildTeam re-lists many Conservation Job Board postings; those are skipped
because CJB is scraped directly, so the WildTeam tab only has jobs the other
tabs don't.

Green Jobs was dropped in Nov 2026: the site now sits behind a Cloudflare bot
check that blocks all automated access (WildTeam's own Green Jobs re-lists
stopped at the same time). Its older postings are still in the data and show
up on the days they were scraped.

## How it works

- `src/run.mjs` scrapes a **today + yesterday** window (Phoenix time), dedupes
  by posting URL, and assigns each posting to its own posting date — so re-runs
  are idempotent and late postings are picked up by the next run.
- Results land in `docs/data/YYYY-MM-DD.json`; `docs/xlsx/jobs-YYYY-MM-DD.xlsx`
  is regenerated for any day that changed.
- GitHub Actions (`.github/workflows/scrape.yml`) runs twice daily
  (8 AM and 8 PM Phoenix) and commits the results.
- GitHub Pages serves `docs/` as the dashboard.

## Run locally

```sh
npm install
node src/run.mjs          # scrape + write data/xlsx
npx http-server docs      # view the dashboard
```

`RUN_DATE=2026-08-13 node src/run.mjs` overrides the run date (useful for testing).
