// Idealist — queries the same public Algolia search index the idealist.org
// frontend uses (search-only API key shipped in their JS bundle). Records
// carry an exact `published` unix timestamp.

import { epochToPhxDate, phxMidnightEpoch, cleanText } from '../util.mjs';

const APP_ID = 'NSV3AUESS7';
const SEARCH_KEY = 'c2730ea10ab82787f2f3cc961e8c1e06';
const INDEX = 'idealist7-production';
const ENDPOINT = `https://${APP_ID}-dsn.algolia.net/1/indexes/${INDEX}/query`;

const ATTRS = [
  'name',
  'orgName',
  'city',
  'stateStr',
  'country',
  'published',
  'url',
  'jobType',
  'locationType',
  'remoteOk',
  'salaryMinimum',
  'salaryMaximum',
  'salaryPeriod',
  'salaryCurrency',
  'areasOfFocus',
];

function pretty(s) {
  return cleanText(
    String(s || '')
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatSalary(hit) {
  const { salaryMinimum: min, salaryMaximum: max, salaryPeriod: period, salaryCurrency: cur } = hit;
  if (!min && !max) return '';
  const range = [min, max].filter(Boolean).join(' - ');
  const per = period ? `/${period.toLowerCase()}` : '';
  return `${cur || 'USD'} ${range}${per}`;
}

function formatLocation(hit) {
  const usCodes = new Set(['US', 'United States']);
  const parts = [hit.city, hit.stateStr, usCodes.has(hit.country) ? '' : hit.country]
    .filter(Boolean)
    .join(', ');
  if (hit.locationType === 'REMOTE' || hit.remoteOk) {
    return parts ? `Remote (${parts})` : 'Remote';
  }
  return parts;
}

export async function scrapeIdealist({ windowDates }) {
  const oldest = windowDates[windowDates.length - 1];
  const sinceEpoch = phxMidnightEpoch(oldest);

  const postings = [];
  let page = 0;
  let nbPages = 1;

  while (page < nbPages && page < 20) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-algolia-application-id': APP_ID,
        'x-algolia-api-key': SEARCH_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: '',
        hitsPerPage: 100,
        page,
        filters: 'type:JOB',
        numericFilters: [`published>=${sinceEpoch}`],
        attributesToRetrieve: ATTRS,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Algolia HTTP ${res.status}`);
    const data = await res.json();
    nbPages = data.nbPages;

    for (const hit of data.hits) {
      const date = epochToPhxDate(hit.published);
      if (!windowDates.includes(date)) continue;
      const path = hit.url?.en;
      if (!path) continue;
      postings.push({
        source: 'idealist',
        date,
        title: cleanText(hit.name),
        org: cleanText(hit.orgName || ''),
        location: formatLocation(hit),
        jobType: (hit.jobType || []).map(pretty).join(', '),
        salary: formatSalary(hit),
        category: (hit.areasOfFocus || []).slice(0, 3).map(pretty).join(', '),
        url: `https://www.idealist.org${path}`,
      });
    }
    page++;
  }

  return postings;
}
