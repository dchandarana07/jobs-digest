// North American Food Systems Network — plain server-rendered classifieds
// table with a date column ("MM/DD/YY") per row.

import * as cheerio from 'cheerio';
import { fetchText, cleanText } from '../util.mjs';

const URL = 'https://members.foodsystemsnetwork.org/members/classifieds5.php?org_id=NAFS';

function toIsoDate(mmddyy) {
  const m = mmddyy.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `20${m[3]}-${m[1]}-${m[2]}`;
}

export async function scrapeNafsn({ windowDates }) {
  const html = await fetchText(URL);
  const $ = cheerio.load(html);
  const postings = [];

  $('#classifiedads tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 4) return;

    const date = toIsoDate(cleanText($(cells[0]).find('p').text()));
    if (!date || !windowDates.includes(date)) return;

    const rawTitle = cleanText($(cells[1]).text());
    const link = $(tr).find('a[href*="moreinfo.php"]').attr('href') || '';

    // Titles look like "PROGRAM DIRECTOR - The Land Connection"
    const sep = rawTitle.indexOf(' - ');
    const title = sep > 0 ? rawTitle.slice(0, sep).trim() : rawTitle;
    const org = sep > 0 ? rawTitle.slice(sep + 3).trim() : '';

    postings.push({
      source: 'nafsn',
      date,
      title,
      org,
      location: cleanText($(cells[2]).text()),
      jobType: '',
      salary: '',
      category: cleanText($(cells[3]).text()),
      url: link,
    });
  });

  return postings;
}
