// Green Jobs Board (greenjobs.greenjobsearch.org) — WordPress/JobRoller.
// The RSS feed lists recent jobs with exact pubDates; each job page embeds
// schema.org JobPosting JSON-LD with org/type/salary/category details.

import * as cheerio from 'cheerio';
import { fetchText, cleanText, phxDateString } from '../util.mjs';

const FEED = 'https://greenjobs.greenjobsearch.org/feed/';

function extractJsonLd(html) {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const job = arr.find((x) => x['@type'] === 'JobPosting');
      if (job) return job;
    } catch {
      // ignore malformed blocks
    }
  }
  return null;
}

function jobLocation(ld) {
  if (!ld) return '';
  if (ld.jobLocationType === 'TELECOMMUTE') return 'Remote';
  const loc = Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation;
  const addr = loc?.address;
  if (!addr) return '';
  return cleanText(
    [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ')
  );
}

export async function scrapeGreenJobs({ windowDates }) {
  const xml = await fetchText(FEED);
  const $ = cheerio.load(xml, { xml: true });
  const items = $('item')
    .toArray()
    .map((el) => ({
      title: cleanText($(el).find('title').first().text()),
      url: cleanText($(el).find('link').first().text()),
      pubDate: cleanText($(el).find('pubDate').first().text()),
    }))
    .filter((it) => it.url.includes('/jobs/'));

  const postings = [];
  for (const it of items) {
    const date = phxDateString(new Date(it.pubDate));
    if (!windowDates.includes(date)) continue;

    let ld = null;
    try {
      ld = extractJsonLd(await fetchText(it.url));
    } catch {
      // detail fetch is best-effort; keep the feed-level info
    }

    postings.push({
      source: 'greenjobs',
      date,
      title: it.title,
      org: cleanText(ld?.hiringOrganization?.name || ''),
      location: jobLocation(ld),
      jobType: cleanText(ld?.employmentType || ''),
      salary:
        ld?.estimatedSalary && ld.estimatedSalary !== 'See posting for details'
          ? cleanText(String(ld.estimatedSalary))
          : '',
      category: cleanText(ld?.occupationalCategory || ''),
      url: it.url,
    });
  }
  return postings;
}
