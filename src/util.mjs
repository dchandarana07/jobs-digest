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

export async function fetchText(url, { headers = {}, retries = 2, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
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

export function cleanText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
