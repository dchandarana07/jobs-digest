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

- `src/run.mjs` scrapes a **3-day** window (today and the two days before,
  Phoenix time; WildTeam looks back 7 days), dedupes by posting URL, and
  assigns each posting to its own posting date — so re-runs are idempotent,
  late postings are picked up by the next run, and a day stays covered through
  a couple of missed or failed runs.
- Results land in `docs/data/YYYY-MM-DD.json`; `docs/xlsx/jobs-YYYY-MM-DD.xlsx`
  is regenerated for any day that changed.
- GitHub Actions (`.github/workflows/scrape.yml`) runs twice daily
  (scheduled for 8:17 AM and 8:17 PM Phoenix, though GitHub often starts them
  hours late) and commits the results. Manual runs on other branches scrape
  and check every source but don't publish.
- GitHub Pages serves `docs/` as the dashboard.

## When something breaks

- A run turns red, and GitHub emails the repo owner, when any source fails.
  Data from the sources that worked is still published.
- Each scraper checks that it could actually read its page (job cards, dates,
  table rows), not just that it found jobs, because quiet days are normal
  (CJB posts nothing most weekends; NAFSN posts in batches). A layout change
  shows up as a failure instead of a silent "0 postings".
- If a scraper hits its page limit and knows it missed postings, it keeps what
  it got and still reports a failure.
- The dashboard shows a warning if the data is more than 36 hours old or the
  last run couldn't fully read a source.

## Run locally

```sh
npm install
node src/run.mjs          # scrape + write data/xlsx
npx http-server docs      # view the dashboard
```

`RUN_DATE=2026-08-13 node src/run.mjs` overrides the run date (useful for testing).
