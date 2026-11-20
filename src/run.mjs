// Orchestrator: scrape every board for a 3-day window (today and the two days
// before, Phoenix time), upsert into per-day JSON, regenerate XLSX for any
// changed day, rebuild the index. GitHub starts scheduled runs hours late and
// occasionally skips one; the 3-day window keeps a day covered through a
// couple of missed or failed runs, and the per-URL dedupe makes the overlap
// free. Exits non-zero only if every source failed (CI then skips the commit).

import fs from 'node:fs';
import path from 'node:path';
import { phxDateString, dateMinusDays } from './util.mjs';
import { scrapeCjb } from './scrapers/cjb.mjs';
import { scrapeIdealist } from './scrapers/idealist.mjs';
import { scrapeNafsn } from './scrapers/nafsn.mjs';
import { scrapeWildTeam } from './scrapers/wildteam.mjs';
import { upsertPostings, rebuildIndex, DATA_DIR } from './store.mjs';
import { writeXlsxForDate } from './xlsx.mjs';

const runDate = process.env.RUN_DATE || phxDateString();
const WINDOW_DAYS = 3;
const windowDates = Array.from({ length: WINDOW_DAYS }, (_, i) => dateMinusDays(runDate, i));
const ctx = { runDate, windowDates };

const scrapers = {
  cjb: scrapeCjb,
  idealist: scrapeIdealist,
  nafsn: scrapeNafsn,
  wildteam: scrapeWildTeam,
};

console.log(`Run date (Phoenix): ${runDate}, window: ${windowDates.join(', ')}`);

const results = await Promise.allSettled(
  Object.entries(scrapers).map(async ([key, fn]) => ({ key, postings: await fn(ctx) }))
);

const allPostings = [];
const sourceStatus = {};
for (const r of results) {
  if (r.status === 'fulfilled') {
    const { key, postings } = r.value;
    sourceStatus[key] = { ok: true, found: postings.length };
    allPostings.push(...postings);
    console.log(`  ${key}: ${postings.length} postings in window`);
  }
}
// Results are positional — attribute failures back to their scraper key.
// A partial failure still carries the postings it got; keep those.
Object.keys(scrapers).forEach((key, i) => {
  if (!(key in sourceStatus)) {
    const reason = results[i].reason;
    const kept = Array.isArray(reason?.postings) ? reason.postings : [];
    allPostings.push(...kept);
    sourceStatus[key] = { ok: false, error: String(reason?.message || reason), found: kept.length };
    const note = kept.length ? ` (kept ${kept.length} postings)` : '';
    console.error(`  ${key}: FAILED — ${sourceStatus[key].error}${note}`);
  }
});

const changed = upsertPostings(allPostings);
for (const { date, added, total } of changed) {
  console.log(`  ${date}: +${added} new (total ${total})`);
}

// Regenerate XLSX for changed days, and always for the run date so the file exists.
const xlsxDates = new Set([runDate, ...changed.map((c) => c.date)]);
for (const date of xlsxDates) {
  await writeXlsxForDate(date);
}

const lastRun = { at: new Date().toISOString(), runDate, sources: sourceStatus };
rebuildIndex({ lastRun });
fs.writeFileSync(path.join(DATA_DIR, '..', 'status.json'), JSON.stringify(lastRun, null, 2));

const okCount = Object.values(sourceStatus).filter((s) => s.ok).length;
console.log(`Done. ${okCount}/${Object.keys(scrapers).length} sources OK, ${allPostings.length} postings in window.`);
if (okCount === 0) process.exit(1);
