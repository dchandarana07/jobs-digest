// Per-day JSON store under docs/data. Postings are deduped by (source, url)
// and assigned to their own posting date, so re-runs are idempotent and a
// late-appearing posting is picked up by the next run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'docs', 'data');
export const XLSX_DIR = path.join(ROOT, 'docs', 'xlsx');

export const SOURCES = {
  cjb: 'Conservation Job Board',
  greenjobs: 'Green Jobs',
  idealist: 'Idealist',
  nafsn: 'NAFSN',
};

function dayPath(date) {
  return path.join(DATA_DIR, `${date}.json`);
}

// Same title + org appearing on more than one board on the same day is almost
// certainly the same posting cross-posted. We keep every copy (so each source
// tab stays complete) but flag the duplicates so readers can skip them.
function crossPostKey(p) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const title = norm(p.title);
  const org = norm(p.org);
  return title && org ? `${title}|${org}` : null;
}

function markCrossPosts(day) {
  const groups = new Map();
  for (const p of day.postings) {
    delete p.alsoOn;
    const key = crossPostKey(p);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const group of groups.values()) {
    const sources = [...new Set(group.map((p) => p.source))];
    if (sources.length < 2) continue;
    for (const p of group) {
      p.alsoOn = sources
        .filter((s) => s !== p.source)
        .map((s) => SOURCES[s])
        .join(', ');
    }
  }
}

export function loadDay(date) {
  try {
    return JSON.parse(fs.readFileSync(dayPath(date), 'utf8'));
  } catch {
    return { date, postings: [] };
  }
}

export function upsertPostings(allPostings) {
  const byDate = new Map();
  for (const p of allPostings) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  const changedDates = [];
  for (const [date, postings] of byDate) {
    const day = loadDay(date);
    const seen = new Set(day.postings.map((p) => `${p.source}|${p.url}`));
    let added = 0;
    for (const p of postings) {
      const key = `${p.source}|${p.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      day.postings.push(p);
      added++;
    }
    if (added > 0) {
      day.postings.sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
      markCrossPosts(day);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(dayPath(date), JSON.stringify(day, null, 2));
      changedDates.push({ date, added, total: day.postings.length });
    }
  }
  return changedDates;
}

export function rebuildIndex({ lastRun }) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const days = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => {
      const day = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      const counts = {};
      for (const key of Object.keys(SOURCES)) counts[key] = 0;
      for (const p of day.postings) counts[p.source] = (counts[p.source] || 0) + 1;
      return { date: day.date, total: day.postings.length, counts };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const index = { lastRun, sources: SOURCES, days };
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}
