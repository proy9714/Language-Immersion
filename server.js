/**
 * Immersion Tracker
 * Zero-dependency Node server. One CSV file per language is the primary database.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4545;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

/** Each language keeps its own log, goal and baseline. */
const LANGUAGES = [
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', tagline: 'Deutsch lernen — every hour counted.' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵', tagline: '日本語を学ぶ — every hour counted.' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', tagline: 'Aprender español — every hour counted.' },
];
const DEFAULT_LANGUAGE = 'de';

const isLanguage = (code) => LANGUAGES.some((l) => l.code === code);
const langOrDefault = (code) => (isLanguage(code) ? code : DEFAULT_LANGUAGE);
const csvPathFor = (code) => path.join(DATA_DIR, `immersion_log_${langOrDefault(code)}.csv`);

const COLUMNS = [
  'entry_id',
  'kind', // "session" | "baseline"
  'category', // one of CATEGORIES; empty for the baseline
  'date',
  'url',
  'video_id',
  'title',
  'channel',
  'duration_seconds',
  'duration_hm', // human-readable "1h 23m" — the seconds column is the machine one
  'logged_at',
];

/**
 * Every immersion event belongs to one of these. Only YouTube is looked up online —
 * the rest are whatever you type, with a duration you enter yourself.
 */
const CATEGORIES = [
  { id: 'youtube', label: 'YouTube', icon: '▶' },
  { id: 'watching', label: 'Watching', icon: '📺' },
  { id: 'reading', label: 'Reading', icon: '📖' },
  { id: 'listening', label: 'Listening', icon: '🎧' },
  { id: 'speaking', label: 'Speaking', icon: '🗣️' },
];
const isCategory = (id) => CATEGORIES.some((c) => c.id === id);
const categoryLabel = (id) => (CATEGORIES.find((c) => c.id === id) || { label: 'Immersion' }).label;

/** Durations are written as hours and minutes — never decimal hours. */
function formatHm(seconds) {
  const mins = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/* ------------------------------------------------------------------ CSV I/O */

function ensureCsv(lang) {
  const file = csvPathFor(lang);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, COLUMNS.join(',') + '\n', 'utf8');
  }
  return file;
}

/** Pre-language installs kept a single immersion_log.csv — adopt it as the German log. */
function migrateLegacyCsv() {
  const legacy = path.join(DATA_DIR, 'immersion_log.csv');
  const target = csvPathFor('de');
  if (fs.existsSync(legacy) && !fs.existsSync(target)) {
    fs.renameSync(legacy, target);
    console.log('  migrated immersion_log.csv → ' + path.basename(target));
  }
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Parse a full CSV document into an array of row-arrays (RFC 4180). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length && r.some((v) => v !== ''));
}

function readEntries(lang) {
  const rows = parseCsv(fs.readFileSync(ensureCsv(lang), 'utf8'));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = r[i] !== undefined ? r[i] : ''));
    const kind = obj.kind === 'baseline' ? 'baseline' : 'session';
    const seconds = Number(obj.duration_seconds) || 0;
    return {
      entry_id: obj.entry_id || '',
      kind,
      // logs written before categories existed held YouTube videos and nothing else
      category: isCategory(obj.category) ? obj.category : kind === 'baseline' ? '' : 'youtube',
      date: obj.date || '',
      url: obj.url || '',
      video_id: obj.video_id || '',
      title: obj.title || '',
      channel: obj.channel || '',
      duration_seconds: seconds,
      duration_hm: formatHm(seconds),
      logged_at: obj.logged_at || '',
    };
  });
}

function appendEntry(lang, entry) {
  const file = ensureCsv(lang);
  const line = COLUMNS.map((c) => csvEscape(entry[c])).join(',') + '\n';
  const existing = fs.readFileSync(file, 'utf8');
  const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, prefix + line, 'utf8');
}

function writeAll(lang, entries) {
  const file = ensureCsv(lang);
  const body = entries
    .map((e) =>
      COLUMNS.map((c) =>
        csvEscape(c === 'duration_hm' ? formatHm(e.duration_seconds) : e[c])
      ).join(',')
    )
    .join('\n');
  fs.writeFileSync(file, COLUMNS.join(',') + '\n' + (body ? body + '\n' : ''), 'utf8');
}

/**
 * Logs written before categories existed have a different header (and decimal hours).
 * Reading normalises them, so one rewrite at startup brings the file up to date.
 */
function upgradeCsv(lang) {
  const file = ensureCsv(lang);
  const header = fs.readFileSync(file, 'utf8').split('\n', 1)[0].replace(/\r$/, '');
  if (header === COLUMNS.join(',')) return;
  writeAll(lang, readEntries(lang));
  console.log('  upgraded ' + path.basename(file) + ' → category format');
}

/* ---------------------------------------------------------------- settings */
/* Preferences only — the CSV stays the sole record of immersion itself. */

const cleanGoal = (v, fallback = 60) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? Math.round(n) : fallback;
};

function readSettings() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    /* first run */
  }

  // A single-language install stored one dailyGoalMinutes — carry it over to German.
  const legacyGoal = raw.dailyGoalMinutes !== undefined ? cleanGoal(raw.dailyGoalMinutes) : null;
  const goals = {};
  for (const l of LANGUAGES) {
    const stored = raw.goals && raw.goals[l.code];
    goals[l.code] = cleanGoal(stored, l.code === DEFAULT_LANGUAGE && legacyGoal !== null ? legacyGoal : 60);
  }

  return { activeLanguage: langOrDefault(raw.activeLanguage), goals };
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/* -------------------------------------------------------------- YouTube bits */

function extractVideoId(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) return null;
  if (/^[\w-]{11}$/.test(input)) return input;

  let u;
  try {
    u = new URL(input.startsWith('http') ? input : 'https://' + input);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return sanitizeId(u.pathname.slice(1));
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;

  const v = u.searchParams.get('v');
  if (v) return sanitizeId(v);

  const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
  return m ? sanitizeId(m[2]) : null;
}

function sanitizeId(id) {
  const clean = String(id || '').split(/[?&#/]/)[0];
  return /^[\w-]{11}$/.test(clean) ? clean : null;
}

function decodeHtml(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'");
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchOembed(videoId) {
  try {
    const res = await fetch(
      'https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + videoId),
      { headers: { 'User-Agent': UA } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return { title: json.title || '', channel: json.author_name || '' };
  } catch {
    return null;
  }
}

async function fetchWatchPage(videoId) {
  try {
    const res = await fetch('https://www.youtube.com/watch?v=' + videoId, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    let seconds = 0;
    const lenMatch =
      html.match(/\\?"lengthSeconds\\?"\s*:\s*\\?"(\d+)\\?"/) ||
      html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
    if (lenMatch) {
      seconds = lenMatch[0].includes('approxDurationMs')
        ? Math.round(Number(lenMatch[1]) / 1000)
        : Number(lenMatch[1]);
    }
    if (!seconds) {
      const iso = html.match(/itemprop="duration"\s+content="([^"]+)"/);
      if (iso) seconds = parseIsoDuration(iso[1]);
    }

    let title = '';
    const t =
      html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ||
      html.match(/<meta\s+name="title"\s+content="([^"]*)"/);
    if (t) title = decodeHtml(t[1]);

    let channel = '';
    const c = html.match(/\\?"ownerChannelName\\?"\s*:\s*\\?"(.*?)\\?"[,}]/);
    if (c) channel = decodeHtml(c[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"'));

    const isLive = /\\?"isLiveNow\\?"\s*:\s*true/.test(html);
    return { seconds, title, channel, isLive };
  } catch {
    return null;
  }
}

function parseIsoDuration(iso) {
  const m = String(iso).match(/P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/**
 * Scrape title / channel / duration.
 *
 * The oEmbed endpoint reliably returns title + channel. The duration only lives in the
 * watch page, and YouTube withholds it from plain server requests for a lot of videos
 * (it answers LOGIN_REQUIRED). When that happens the browser resolves the duration
 * instead — see resolveInBrowser() in public/app.js.
 */
async function lookupVideo(videoId) {
  const [oembed, page] = await Promise.all([fetchOembed(videoId), fetchWatchPage(videoId)]);
  return {
    title: (oembed && oembed.title) || (page && page.title) || '',
    channel: (oembed && oembed.channel) || (page && page.channel) || '',
    seconds: page ? page.seconds : 0,
    isLive: !!(page && page.isLive),
  };
}

/* ------------------------------------------------------------------- helpers */

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

function makeId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* -------------------------------------------------------------------- routes */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // Every data route is scoped to one language. Without an explicit ?lang the server
  // falls back to whichever language was last opened.
  const lang = url.searchParams.has('lang')
    ? langOrDefault(url.searchParams.get('lang'))
    : readSettings().activeLanguage;

  try {
    /* --- API --- */
    if (pathname === '/api/entries' && req.method === 'GET') {
      const settings = readSettings();
      return sendJson(res, 200, {
        entries: readEntries(lang),
        language: lang,
        languages: LANGUAGES,
        categories: CATEGORIES,
        activeLanguage: settings.activeLanguage,
        settings: { dailyGoalMinutes: settings.goals[lang] },
        csvPath: csvPathFor(lang),
        today: todayLocal(),
      });
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req);
      const mins = Number(body.dailyGoalMinutes);
      if (!Number.isFinite(mins) || mins < 0 || mins > 1440) {
        return sendJson(res, 400, { error: 'Daily goal must be between 0 and 1440 minutes.' });
      }
      const settings = readSettings();
      settings.goals[lang] = Math.round(mins);
      writeSettings(settings);
      return sendJson(res, 200, { settings: { dailyGoalMinutes: settings.goals[lang] } });
    }

    /** Remember which language to open next time. */
    if (pathname === '/api/language' && req.method === 'POST') {
      const body = await readBody(req);
      if (!isLanguage(body.code)) return sendJson(res, 400, { error: 'Unknown language.' });
      const settings = readSettings();
      settings.activeLanguage = body.code;
      writeSettings(settings);
      return sendJson(res, 200, { activeLanguage: settings.activeLanguage });
    }

    if (pathname === '/api/entries' && req.method === 'POST') {
      const body = await readBody(req);
      const category = isCategory(body.category) ? body.category : 'youtube';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayLocal();

      /* Anything that is not a YouTube link is logged exactly as it was typed:
         a title of your choosing and a duration in hours and minutes. */
      if (category !== 'youtube') {
        const seconds = Math.round(Number(body.durationSeconds) || 0);
        if (!(seconds > 0)) {
          return sendJson(res, 400, { error: 'Enter how long the session lasted.' });
        }
        if (seconds > 24 * 3600) {
          return sendJson(res, 400, { error: 'A single session cannot be longer than 24 hours.' });
        }
        const entry = {
          entry_id: makeId(),
          kind: 'session',
          category,
          date,
          url: '',
          video_id: '',
          title: String(body.title || '').trim() || `${categoryLabel(category)} session`,
          channel: '',
          duration_seconds: seconds,
          duration_hm: formatHm(seconds),
          logged_at: localTimestamp(),
        };
        appendEntry(lang, entry);
        return sendJson(res, 201, { entry });
      }

      const videoId = extractVideoId(body.url);
      if (!videoId) {
        return sendJson(res, 400, { error: 'That does not look like a YouTube video link.' });
      }

      const manual = Number(body.durationSeconds) || 0;
      let meta = { title: '', channel: '', seconds: 0, isLive: false };
      if (!manual || !body.title) {
        meta = await lookupVideo(videoId);
      }

      const seconds = manual > 0 ? Math.round(manual) : meta.seconds;
      if (!seconds) {
        // Not fatal: the browser can usually still resolve it via the embedded player.
        return sendJson(res, 422, {
          needsBrowserLookup: true,
          videoId,
          title: meta.title,
          channel: meta.channel,
          error: meta.isLive
            ? 'This is a live stream — YouTube reports no fixed duration. Enter how long you watched.'
            : 'YouTube would not hand the duration to the server for this video.',
          isLive: !!meta.isLive,
        });
      }

      const entry = {
        entry_id: makeId(),
        kind: 'session',
        category: 'youtube',
        date,
        url: 'https://www.youtube.com/watch?v=' + videoId,
        video_id: videoId,
        title: (body.title || meta.title || '').trim() || 'Untitled video',
        channel: (body.channel || meta.channel || '').trim(),
        duration_seconds: seconds,
        duration_hm: formatHm(seconds),
        logged_at: localTimestamp(),
      };
      appendEntry(lang, entry);
      return sendJson(res, 201, { entry });
    }

    /**
     * The baseline is immersion done before tracking began. It lives in the CSV like
     * everything else — so the total is always the sum of the file — but carries no date,
     * which keeps it out of "today", the 7-day window, the streak and the chart.
     */
    if (pathname === '/api/baseline' && req.method === 'POST') {
      const body = await readBody(req);
      const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));
      const kept = readEntries(lang).filter((e) => e.kind !== 'baseline');

      if (seconds > 0) {
        kept.push({
          entry_id: makeId(),
          kind: 'baseline',
          category: '',
          date: '',
          url: '',
          video_id: '',
          title: 'Immersion before tracking started',
          channel: '',
          duration_seconds: seconds,
          duration_hm: formatHm(seconds),
          logged_at: localTimestamp(),
        });
      }
      writeAll(lang, kept);
      return sendJson(res, 200, { seconds });
    }

    if (pathname.startsWith('/api/entries/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const entries = readEntries(lang);
      const kept = entries.filter((e) => e.entry_id !== id);
      if (kept.length === entries.length) return sendJson(res, 404, { error: 'Entry not found.' });
      writeAll(lang, kept);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/csv' && req.method === 'GET') {
      const file = ensureCsv(lang);
      return send(res, 200, fs.readFileSync(file), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${path.basename(file)}"`,
      });
    }

    /* --- static --- */
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return send(res, 200, fs.readFileSync(filePath), {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      });
    }
    return send(res, 404, 'Not found');
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: err.message || 'Server error' });
  }
});

migrateLegacyCsv();
LANGUAGES.forEach((l) => {
  ensureCsv(l.code);
  upgradeCsv(l.code);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('\n  Port ' + PORT + ' is already in use.');
    console.log('  The tracker is most likely already running — open:');
    console.log('      http://localhost:' + PORT);
    console.log('\n  To run a second copy on another port:  set PORT=4546 && node server.js\n');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\n  Immersion Tracker');
  console.log('  ──────────────────────────────────────────');
  console.log('  Open:  http://localhost:' + PORT);
  LANGUAGES.forEach((l) =>
    console.log(`  [${l.code.toUpperCase()}] ${l.name.padEnd(9)} ${path.basename(csvPathFor(l.code))}`)
  );
  console.log('');
});
