// Shared helpers. All "day" logic uses America/Phoenix (fixed UTC-7, no DST).

const PHX_OFFSET_MS = -7 * 3600 * 1000;

export function phxDateString(d = new Date()) {
  const shifted = new Date(d.getTime() + PHX_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

export function epochToPhxDate(epochSeconds) {
  return phxDateString(new Date(epochSeconds * 1000));
}

export function phxMidnightEpoch(dateStr) {
  // Midnight in Phoenix = 07:00 UTC of the same calendar date
  return Math.floor(Date.parse(`${dateStr}T07:00:00Z`) / 1000);
}

export function dateMinusDays(dateStr, days) {
  const d = new Date(Date.parse(`${dateStr}T12:00:00Z`) - days * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Extra options (method, body) pass through to fetch(). Every attempt gets its
// own timeout; failures are retried with a growing pause.
export async function fetchText(url, { headers = {}, retries = 2, timeoutMs = 30000, ...init } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

// Thrown by a scraper that got some postings but knows it missed others. The
// orchestrator keeps the postings it carries and still reports the source as
// failed, so the run shows red instead of silently dropping data.
export class PartialScrapeError extends Error {
  constructor(message, postings) {
    super(message);
    this.postings = postings;
  }
}

export function cleanText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
