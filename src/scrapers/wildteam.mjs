// WildTeam Jobs (jobs.wildteam.org.uk) — a Next.js site that embeds the full
// list of current jobs (all countries) as JSON in its React Server Components
// payload. We read that payload from the public listing page and keep US jobs.
// robots.txt disallows /api/, so we never call the site's API directly.
//
// WildTeam aggregates other boards. Most of its US jobs are re-listed from
// Conservation Job Board, which we already scrape directly, and WildTeam files
// them under a different date than our CJB scraper does, so the store's
// same-day cross-post check can't catch them. We skip those, which leaves the
// WildTeam tab with jobs the digest doesn't otherwise have (NRDC, Trust for
// Public Land, Sierra Club, Earthjustice, ...).
//
// WildTeam picks up other boards' postings a day or two late, so a plain
// today+yesterday window would miss them. We look back LOOKBACK_DAYS instead;
// each posting is still filed under its own posting date, and the store's
// dedupe makes the overlap between runs harmless.

import { fetchText, cleanText, phxDateString, dateMinusDays } from '../util.mjs';

const LISTING_URL = 'https://jobs.wildteam.org.uk/?place=United+States';
const LOOKBACK_DAYS = 7;

function alreadyScraped(job) {
  return (
    job.sourceName === 'Conservation Job Board' ||
    /(^|\.)conservationjobboard\.com$/i.test(hostname(job.sourceUrl))
  );
}

function hostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Next.js streams page data as self.__next_f.push([1,"<JSON-escaped text>"]).
function readFlightData(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  for (const m of html.matchAll(re)) out += JSON.parse(`"${m[1]}"`);
  return out;
}

// Pull the `"jobs":[...]` array out of the flight text by bracket matching.
function extractJobsArray(flight) {
  const marker = '"jobs":[';
  const at = flight.indexOf(marker);
  if (at < 0) throw new Error('WildTeam page format changed: jobs list not found');
  const start = at + marker.length - 1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(flight.slice(start, i + 1));
    }
  }
  throw new Error('WildTeam page format changed: jobs list is truncated');
}

// Some upstream boards only give a date, which WildTeam stores as US midnight
// (00:00Z, or 04:00Z/05:00Z for Eastern time). Converting those to Phoenix
// time would push them to the previous day, so keep their calendar date.
function postedDate(iso) {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):00:00(?:\.0+)?(?:Z|\+00:00)$/);
  if (m && Number(m[2]) <= 8) return m[1];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : phxDateString(d);
}

function location(job) {
  const loc = cleanText(String(job.location || '').replace(/\bUNAVAILABLE,\s*/gi, ''));
  const type = job.locationType;
  if (type && type !== 'On-site' && !loc.toLowerCase().includes(type.toLowerCase())) {
    return loc ? `${loc} (${type})` : type;
  }
  return loc;
}

function jobType(job) {
  const parts = [job.employmentType, job.contractType];
  if (job.engagementType && job.engagementType !== 'Paid') parts.push(job.engagementType);
  return parts.filter(Boolean).map(cleanText).join(', ');
}

function salary(job) {
  const s = cleanText(job.salary);
  if (!s || s === 'Not stated') return '';
  return s.replace(/\$\$/g, '$'); // WildTeam's data sometimes doubles the $
}

export async function scrapeWildTeam({ runDate }) {
  const jobs = extractJobsArray(readFlightData(await fetchText(LISTING_URL)));
  if (!jobs.length) throw new Error('WildTeam returned no jobs');

  const lookback = new Set(Array.from({ length: LOOKBACK_DAYS }, (_, i) => dateMinusDays(runDate, i)));
  const postings = [];
  for (const job of jobs) {
    if (job.countryCode !== 'US' || !job.sourceUrl || alreadyScraped(job)) continue;
    const date = postedDate(job.postedAt || job.publishedAt);
    if (!date || !lookback.has(date)) continue;

    postings.push({
      source: 'wildteam',
      date,
      title: cleanText(job.title),
      org: cleanText(job.organisation),
      location: location(job),
      jobType: jobType(job),
      salary: salary(job),
      category: cleanText(job.category),
      url: job.sourceUrl,
    });
  }
  return postings;
}
