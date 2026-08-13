// Conservation Job Board — server-rendered Livewire pages, sorted by date.
// Cards carry relative labels ("Today", "Yesterday", "N days ago") which we
// resolve against the run date.

import * as cheerio from 'cheerio';
import { fetchText, cleanText, dateMinusDays } from '../util.mjs';

const BASE = 'https://www.conservationjobboard.com/';
const MAX_PAGES = 10;

function labelToDate(label, runDate) {
  const t = label.toLowerCase();
  if (t === 'today') return runDate;
  if (t === 'yesterday') return dateMinusDays(runDate, 1);
  const m = t.match(/^(\d+)\s+days?\s+ago$/);
  if (m) return dateMinusDays(runDate, Number(m[1]));
  return null;
}

export async function scrapeCjb({ runDate, windowDates }) {
  const postings = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}?sort_by=date${page > 1 ? `&page=${page}` : ''}`;
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    let inWindowThisPage = 0;

    $('article').each((_, el) => {
      const $a = $(el).find('h2.listing__job__title a').first();
      const href = $a.attr('href');
      if (!href || !href.includes('/job-listing-')) return;
      const jobUrl = href.split('?')[0];
      if (seen.has(jobUrl)) return;

      const label = cleanText($(el).find('.listing__job__time').first().text());
      const date = labelToDate(label, runDate);
      if (!date || !windowDates.includes(date)) return;

      seen.add(jobUrl);
      inWindowThisPage++;

      let jobType = '';
      let salary = '';
      $(el)
        .find('p.listing__job__intro')
        .each((_, p) => {
          const txt = cleanText($(p).text());
          if (/^job type\s*:/i.test(txt)) jobType = txt.replace(/^job type\s*:\s*/i, '');
          if (/^salary\s*:/i.test(txt)) salary = txt.replace(/^salary\s*:\s*/i, '');
        });

      postings.push({
        source: 'cjb',
        date,
        title: cleanText($a.text()),
        org: cleanText($(el).find('h3').first().text()),
        location: cleanText($(el).find('h4').first().text()),
        jobType,
        salary,
        category: cleanText($a.attr('categories') || ''),
        url: jobUrl,
      });
    });

    // Date-sorted: once a whole page contributes nothing in-window, stop.
    if (inWindowThisPage === 0) break;
  }

  return postings;
}
