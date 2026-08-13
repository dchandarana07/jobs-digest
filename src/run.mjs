// Orchestrator: scrape all 4 boards for a today+yesterday window, upsert into
// per-day JSON, regenerate XLSX for any changed day, rebuild the index.
// Exits non-zero only if every source failed (so CI alerts on total outage).

import fs from 'node:fs';
import path from 'node:path';
import { phxDateString, dateMinusDays } from './util.mjs';
import { scrapeCjb } from './scrapers/cjb.mjs';
import { scrapeGreenJobs } from './scrapers/greenjobs.mjs';
import { scrapeIdealist } from './scrapers/idealist.mjs';
import { scrapeNafsn } from './scrapers/nafsn.mjs';
import { upsertPostings, rebuildIndex, DATA_DIR } from './store.mjs';
import { writeXlsxForDate } from './xlsx.mjs';

const runDate = process.env.RUN_DATE || phxDateString();
const windowDates = [runDate, dateMinusDays(runDate, 1)];
const ctx = { runDate, windowDates };

const scrapers = {
  cjb: scrapeCjb,
  greenjobs: scrapeGreenJobs,
  idealist: scrapeIdealist,
  nafsn: scrapeNafsn,
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
Object.keys(scrapers).forEach((key, i) => {
  if (!(key in sourceStatus)) {
    sourceStatus[key] = { ok: false, error: String(results[i].reason?.message || results[i].reason) };
    console.error(`  ${key}: FAILED — ${sourceStatus[key].error}`);
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
console.log(`Done. ${okCount}/4 sources OK, ${allPostings.length} postings in window.`);
if (okCount === 0) process.exit(1);
