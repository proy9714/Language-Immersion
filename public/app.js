/* Immersion Tracker — frontend */

const $ = (id) => document.getElementById(id);

const el = {
  form: $('addForm'), url: $('url'), date: $('date'), title: $('title'),
  cH: $('cH'), cM: $('cM'),
  urlField: $('urlField'), titleField: $('titleField'), timeField: $('timeField'),
  catTabs: $('catTabs'), catFilter: $('catFilter'), catSplit: $('catSplit'),
  submitBtn: $('submitBtn'),
  btnLabel: document.querySelector('#submitBtn .btn-label'),
  msg: $('msg'),
  manualBox: $('manualBox'), manualMsg: $('manualMsg'), manualSave: $('manualSave'),
  mH: $('mH'), mM: $('mM'), mTitle: $('mTitle'),
  chart: $('chart'), logBody: $('logBody'), logCount: $('logCount'),
  empty: $('empty'), search: $('search'), csvPath: $('csvPath'),
  manualToggle: $('manualToggle'), ytHost: $('ytHost'),
  baselineToggle: $('baselineToggle'), mTitleField: $('mTitleField'),
  goalFill: $('goalFill'), goalNum: $('goalNum'), goalEdit: $('goalEdit'),
  goalEditor: $('goalEditor'), goalH: $('goalH'), goalM: $('goalM'),
  levelBars: $('levelBars'), levelNow: $('levelNow'), lpTotal: $('lpTotal'), lpFill: $('lpFill'),
  lpFrom: $('lpFrom'), lpTo: $('lpTo'), levelNext: $('levelNext'), levelNextHrs: $('levelNextHrs'),
  statWatched: $('statWatched'), statSessions: $('statSessions'), statDays: $('statDays'),
  levels: $('levels'), levelsHint: $('levelsHint'),
  langBtn: $('langBtn'), langMenu: $('langMenu'), langBtnFlag: $('langBtnFlag'),
  langBtnName: $('langBtnName'), brandFlag: $('brandFlag'), brandTitle: $('brandTitle'),
  brandSub: $('brandSub'), csvLink: $('csvLink'),
  chips: ['logChip', 'progChip', 'levelsChip', 'footChip'].map($),
};

/* Flags as SVG, for the favicon — same reason the CSS flags exist. */
const FLAG_SVG = {
  de: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 3'><rect width='5' height='1' fill='%23000'/><rect y='1' width='5' height='1' fill='%23dd0000'/><rect y='2' width='5' height='1' fill='%23ffce00'/></svg>",
  es: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='%23aa151b'/><rect y='0.75' width='4' height='1.5' fill='%23f1bf00'/></svg>",
  ja: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='%23fff'/><circle cx='1.5' cy='1' r='0.6' fill='%23bc002d'/></svg>",
};

/* Colours per category. The server owns the list itself — this is presentation only. */
const CAT_STYLE = {
  youtube:   { color: '#ff6b5b', soft: 'rgba(255,107,91,.14)',  line: 'rgba(255,107,91,.36)' },
  watching:  { color: '#7dd3fc', soft: 'rgba(125,211,252,.13)', line: 'rgba(125,211,252,.34)' },
  reading:   { color: '#c084fc', soft: 'rgba(192,132,252,.13)', line: 'rgba(192,132,252,.34)' },
  listening: { color: '#5eead4', soft: 'rgba(94,234,212,.12)',  line: 'rgba(94,234,212,.32)' },
  speaking:  { color: '#f5c542', soft: 'rgba(245,197,66,.13)',  line: 'rgba(245,197,66,.34)' },
  baseline:  { color: '#94a3b8', soft: 'rgba(148,163,184,.12)', line: 'rgba(148,163,184,.3)' },
};

/* Comprehensible-input roadmap: hours of input needed to reach each level. */
const LEVELS = [
  { n: 1, hours: 0,    words: '0',       icon: '🎖️', color: '#ff6b5b', desc: 'Starting from zero.' },
  { n: 2, hours: 50,   words: '300',     icon: '🛡️', color: '#f472b6', desc: 'You know some common words.' },
  { n: 3, hours: 150,  words: '1,500',   icon: '🏆', color: '#c084fc', desc: 'You can follow topics that are adapted for learners.' },
  { n: 4, hours: 300,  words: '3,000',   icon: '💎', color: '#7dd3fc', desc: 'You can understand a person speaking to you patiently.' },
  { n: 5, hours: 600,  words: '5,000',   icon: '🏅', color: '#5eead4', desc: 'You can understand native speakers speaking to you normally.' },
  { n: 6, hours: 1000, words: '7,000',   icon: '🗼', color: '#86efac', desc: 'You are comfortable with daily conversation.' },
  { n: 7, hours: 1500, words: '12,000+', icon: '👑', color: '#f5c542', desc: 'You can use the language effectively for all practical purposes.' },
];

let entries = [];
let settings = { dailyGoalMinutes: 60 };
let today = localDate(new Date());
let languages = [];
let categories = [];
// Active language code. Null until the first load, so the server can pick the one that
// was open last; ?lang=xx in the address bar overrides it.
let lang = new URLSearchParams(location.search).get('lang') || null;
let category = 'youtube'; // which tab the add-form is on
let pending = null; // video awaiting a manual duration
let manualMode = 'video'; // "video" | "baseline"

/* ------------------------------------------------------------------ utils */

function localDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localDate(dt);
}

const hours = (secs) => secs / 3600;

/**
 * Every duration in the UI is hours and minutes — never decimal hours.
 * 4530s → "1h 16m", 900s → "15m", 7200s → "2h".
 */
function fmtHm(secs) {
  const mins = Math.round(Math.max(0, secs) / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Same figure, with the units marked up so they can be styled down. */
function hmMarkup(secs) {
  const mins = Math.round(Math.max(0, secs) / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}<em>h</em> ${m}<em>m</em>`;
  if (h) return `${h}<em>h</em>`;
  return `${m}<em>m</em>`;
}

function prettyDate(iso) {
  if (iso === today) return 'Today';
  if (iso === shiftDate(today, -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const opts = { day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString(undefined, opts);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function flash(text, kind) {
  el.msg.textContent = text;
  el.msg.className = 'msg ' + kind;
  el.msg.hidden = false;
  clearTimeout(flash.t);
  if (kind === 'ok') flash.t = setTimeout(() => (el.msg.hidden = true), 5000);
}

function busy(on, btn = el.submitBtn) {
  btn.disabled = on;
  const sp = btn.querySelector('.spinner');
  if (sp) sp.hidden = !on;
}

/* ------------------------------------------------------------- categories */

const catMeta = (id) => {
  const found = categories.find((c) => c.id === id);
  const style = CAT_STYLE[id] || CAT_STYLE.baseline;
  return {
    id,
    label: found ? found.label : id === 'baseline' ? 'Baseline' : id || '—',
    icon: found ? found.icon : id === 'baseline' ? '⚑' : '•',
    ...style,
  };
};

/** The category of an entry, with the baseline treated as its own pseudo-category. */
const entryCat = (e) => (e.kind === 'baseline' ? 'baseline' : e.category || 'youtube');

function catChip(id) {
  const c = catMeta(id);
  return `<span class="cat-chip" style="--c:${c.color};--c-soft:${c.soft};--c-line:${c.line}">
      <span class="cat-ic">${c.icon}</span>${esc(c.label)}</span>`;
}

function renderCategoryTabs() {
  el.catTabs.innerHTML = categories
    .map((c) => {
      const s = CAT_STYLE[c.id] || CAT_STYLE.baseline;
      return `<button type="button" role="tab" class="cat-tab ${c.id === category ? 'on' : ''}"
        aria-selected="${c.id === category}" data-cat="${c.id}"
        style="--c:${s.color};--c-soft:${s.soft};--c-line:${s.line}">
        <span class="ct-ic">${c.icon}</span><span class="ct-label">${esc(c.label)}</span>
      </button>`;
    })
    .join('');

  const keep = el.catFilter.value;
  el.catFilter.innerHTML =
    `<option value="">All types</option>` +
    categories.map((c) => `<option value="${c.id}">${esc(c.icon + ' ' + c.label)}</option>`).join('') +
    `<option value="baseline">⚑ Baseline</option>`;
  el.catFilter.value = keep;
}

/** Swap the add-form between "paste a link" and "type a duration". */
function applyCategory() {
  const isYt = category === 'youtube';
  const c = catMeta(category);

  el.urlField.hidden = !isYt;
  el.titleField.hidden = isYt;
  el.timeField.hidden = isYt;
  el.manualToggle.hidden = !isYt;
  el.btnLabel.textContent = isYt ? 'Log immersion' : `Log ${c.label.toLowerCase()}`;
  el.title.placeholder =
    {
      watching: 'e.g. Dark — S01E02',
      reading: 'e.g. Der Kleine Prinz — chapter 3',
      listening: 'e.g. Slow German podcast #48',
      speaking: 'e.g. Tandem call with Lena',
    }[category] || 'What did you immerse in?';

  el.catTabs.querySelectorAll('.cat-tab').forEach((tab) => {
    const on = tab.dataset.cat === category;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-selected', String(on));
  });
}

el.catTabs.addEventListener('click', (ev) => {
  const tab = ev.target.closest('.cat-tab');
  if (!tab || tab.dataset.cat === category) return;
  category = tab.dataset.cat;
  pending = null;
  el.msg.hidden = true;
  closeManual();
  applyCategory();
  (category === 'youtube' ? el.url : el.title).focus();
});

/* ------------------------------------------- duration lookup in the browser */
/*
 * YouTube refuses to give the server a duration for many videos, but the embedded
 * player runs on youtube.com's own origin inside this page, so it will happily
 * report one. No API key involved.
 */

const PLAYER_ERRORS = {
  2: 'YouTube rejected that video id.',
  5: 'The video cannot be played in an embedded player.',
  100: 'That video is private, deleted, or does not exist.',
  101: 'The owner does not allow this video to be embedded.',
  150: 'The owner does not allow this video to be embedded.',
};

let ytApiPromise = null;

function loadYtApi() {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('Could not reach YouTube to load the player.'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('The YouTube player took too long to load.')), 15000);
  });
  return ytApiPromise;
}

/** Resolve {seconds, title, channel} for a video id, or throw with a readable reason. */
async function resolveInBrowser(videoId) {
  await loadYtApi();

  const slot = document.createElement('div');
  el.ytHost.appendChild(slot);

  return new Promise((resolve, reject) => {
    let settled = false;
    let poll;
    let player;

    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(bail);
      try {
        player.destroy();
      } catch {
        /* player may not exist yet */
      }
      slot.remove();
    };
    const ok = (v) => { if (!settled) { settled = true; cleanup(); resolve(v); } };
    const fail = (m) => { if (!settled) { settled = true; cleanup(); reject(new Error(m)); } };

    const bail = setTimeout(() => fail('The player did not report a duration in time.'), 20000);

    player = new YT.Player(slot, {
      videoId,
      width: 320,
      height: 180,
      playerVars: { autoplay: 0, mute: 1, playsinline: 1, controls: 0 },
      events: {
        onReady: () => {
          player.mute();
          let ticks = 0;
          poll = setInterval(() => {
            const secs = player.getDuration ? player.getDuration() : 0;
            if (secs > 0) {
              const d = (player.getVideoData && player.getVideoData()) || {};
              player.stopVideo();
              ok({
                seconds: Math.round(secs),
                title: d.title || '',
                channel: d.author || '',
              });
              return;
            }
            // Some videos only publish their duration once playback is primed.
            if (++ticks === 3) {
              try {
                player.playVideo();
              } catch {
                /* autoplay may be refused; the poll keeps trying */
              }
            }
          }, 200);
        },
        onError: (e) => fail(PLAYER_ERRORS[e.data] || 'The embedded player refused this video.'),
      },
    });
  });
}

/* ------------------------------------------------------------------- data */

/** Language-scoped URL for any API call. */
const api = (path) => (lang ? path + (path.includes('?') ? '&' : '?') + 'lang=' + lang : path);

async function load() {
  const res = await fetch(api('/api/entries'));
  const data = await res.json();
  lang = data.language;
  entries = data.entries;
  if (data.settings) settings = data.settings;
  if (data.languages) languages = data.languages;
  if (data.categories) categories = data.categories;
  today = data.today;
  if (data.csvPath) el.csvPath.textContent = data.csvPath;
  if (!el.date.value) el.date.value = today;
  renderLanguage();
  renderCategoryTabs();
  applyCategory();
  render();
}

/* --------------------------------------------------------------- language */

function currentLanguage() {
  return languages.find((l) => l.code === lang) || { code: lang, name: '', flag: '', tagline: '' };
}

const flagClass = (code) => `flag-icon flag-${code}`;

function renderLanguage() {
  const active = currentLanguage();

  el.brandFlag.className = 'flag ' + flagClass(active.code);
  el.brandTitle.textContent = `${active.name} Immersion Tracker`;
  el.brandSub.textContent = active.tagline;
  el.langBtnFlag.className = flagClass(active.code);
  el.langBtnName.textContent = active.name;
  el.csvLink.href = api('/api/csv');
  document.title = `${active.name} Immersion Tracker`;

  // flag + name wherever the language is referred to
  el.chips.forEach((chip) => {
    if (!chip) return;
    chip.innerHTML = `<span class="${flagClass(active.code)}"></span>${esc(active.name)}`;
  });

  const icon = document.querySelector('link[rel="icon"]');
  if (icon && FLAG_SVG[active.code]) icon.href = 'data:image/svg+xml,' + FLAG_SVG[active.code];

  el.langMenu.innerHTML = languages
    .map(
      (l) => `<button class="lang-item ${l.code === lang ? 'on' : ''}" role="menuitem"
                       type="button" data-code="${l.code}">
        <span class="${flagClass(l.code)} li-flag"></span>
        <span class="li-name">${esc(l.name)}<span class="li-native">${esc(l.native)}</span></span>
        <span class="li-check">✔</span>
      </button>`
    )
    .join('');
}

function closeLangMenu() {
  el.langMenu.hidden = true;
  el.langBtn.setAttribute('aria-expanded', 'false');
}

async function switchLanguage(code) {
  closeLangMenu();
  if (code === lang) return;

  lang = code;
  el.msg.hidden = true;
  closeManual();
  el.search.value = '';
  el.catFilter.value = '';
  el.form.reset();
  await load();
  el.date.value = today;

  // remember the choice for next time; harmless if it fails
  fetch('/api/language', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => {});

  flash(`Switched to ${currentLanguage().name} — separate log, goal and baseline.`, 'ok');
}

el.langBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  const open = el.langMenu.hidden;
  el.langMenu.hidden = !open;
  el.langBtn.setAttribute('aria-expanded', String(open));
});

el.langMenu.addEventListener('click', (ev) => {
  const item = ev.target.closest('.lang-item');
  if (item) switchLanguage(item.dataset.code);
});

document.addEventListener('click', (ev) => {
  if (!el.langMenu.hidden && !ev.target.closest('.lang-picker')) closeLangMenu();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') closeLangMenu();
});

/* ---------------------------------------------------------------- render */

function render(flashId) {
  renderStats();
  renderGoal();
  renderProgression();
  renderStatistics();
  renderLevels();
  renderChart();
  renderLog(flashId);
}

/* ------------------------------------------------------ levels & progress */

const totalSeconds = () => entries.reduce((a, e) => a + e.duration_seconds, 0);
const sessionEntries = () => entries.filter((e) => e.kind !== 'baseline');
const sumSeconds = (list) => list.reduce((a, e) => a + e.duration_seconds, 0);

function levelFor(totalHours) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (totalHours >= l.hours) current = l;
  return current;
}

/** Days to cover `hoursNeeded` at the current daily goal, or null if no goal is set. */
function daysAtGoal(hoursNeeded) {
  const perDay = settings.dailyGoalMinutes / 60;
  if (!perDay) return null;
  return Math.max(0, Math.ceil(hoursNeeded / perDay));
}

function renderGoal() {
  const goal = settings.dailyGoalMinutes;
  const doneSecs = sumSeconds(sessionEntries().filter((e) => e.date === today));
  const todayMins = doneSecs / 60;

  const pct = goal > 0 ? Math.min((todayMins / goal) * 100, 100) : 0;
  el.goalFill.style.width = pct + '%';
  el.goalFill.classList.toggle('done', goal > 0 && todayMins >= goal);
  el.goalNum.textContent =
    goal > 0 ? `${fmtHm(doneSecs)} / ${fmtHm(goal * 60)}` : `${fmtHm(doneSecs)} · no goal set`;
}

function renderProgression() {
  const totalSecs = totalSeconds();
  const totalH = hours(totalSecs);
  const current = levelFor(totalH);
  const next = LEVELS.find((l) => l.hours > totalH) || null;

  // seven bars, tallest last; everything up to the current level is lit
  el.levelBars.innerHTML = LEVELS.map((l, i) => {
    const on = l.n <= current.n;
    const h = 30 + i * 11.6;
    return `<div class="lb ${on ? 'on' : ''} ${l.n === current.n ? 'cur' : ''}"
       style="height:${h}%;animation-delay:${i * 45}ms;color:${l.color};${
      on ? `background:${l.color}` : ''
    }" title="Level ${l.n} — ${l.hours}h"></div>`;
  }).join('');

  el.levelNow.textContent = `Level ${current.n}`;
  el.lpTotal.textContent = fmtHm(totalSecs);

  const from = current.hours;
  const to = next ? next.hours : current.hours;
  const span = to - from;
  const pct = span > 0 ? Math.min(((totalH - from) / span) * 100, 100) : 100;
  el.lpFill.style.width = pct + '%';
  el.lpFrom.textContent = `${from}h`;
  el.lpTo.textContent = next ? `${to}h` : 'max';

  el.levelNext.hidden = false;
  if (next) {
    el.levelNext.firstElementChild.textContent = `Time to level ${next.n}`;
    el.levelNextHrs.textContent = fmtHm(next.hours * 3600 - totalSecs);
  } else {
    el.levelNext.firstElementChild.textContent = 'Highest level reached';
    el.levelNextHrs.textContent = '🎉';
  }
}

function renderStatistics() {
  const sessions = sessionEntries();
  const days = new Set(sessions.map((e) => e.date).filter(Boolean));

  el.statWatched.textContent = fmtHm(sumSeconds(sessions));
  el.statSessions.textContent = sessions.length;
  el.statDays.textContent = days.size;

  // where the time actually went
  const rows = categories
    .map((c) => ({ ...catMeta(c.id), secs: sumSeconds(sessions.filter((e) => entryCat(e) === c.id)) }))
    .sort((a, b) => b.secs - a.secs);
  const max = Math.max(...rows.map((r) => r.secs), 1);
  const total = rows.reduce((a, r) => a + r.secs, 0);

  el.catSplit.innerHTML =
    `<div class="split-head">Where the time went</div>` +
    rows
      .map(
        (r) => `<div class="split-row ${r.secs ? '' : 'zero'}" style="--c:${r.color}">
          <span class="split-name"><span class="split-ic">${r.icon}</span>${esc(r.label)}</span>
          <span class="split-track"><span class="split-fill" style="width:${
            (r.secs / max) * 100
          }%"></span></span>
          <span class="split-val">${fmtHm(r.secs)}<small>${
          total ? Math.round((r.secs / total) * 100) : 0
        }%</small></span>
        </div>`
      )
      .join('');
}

function renderLevels() {
  const totalH = hours(totalSeconds());
  const current = levelFor(totalH);

  el.levelsHint.textContent =
    settings.dailyGoalMinutes > 0
      ? `projections based on ${fmtHm(settings.dailyGoalMinutes * 60)}/day`
      : 'set a daily goal to see projections';

  el.levels.innerHTML = LEVELS.map((l) => {
    const reached = totalH >= l.hours;
    const isCurrent = l.n === current.n;
    const remaining = l.hours - totalH;

    let eta = '';
    if (!reached) {
      const days = daysAtGoal(remaining);
      eta =
        days === null
          ? `<div class="level-eta">🗓️ Set a daily goal to project when you'll reach this level.</div>`
          : `<div class="level-eta">🗓️ You'll reach this level in ${days.toLocaleString()} day${
              days === 1 ? '' : 's'
            } based on your current daily goal.</div>`;
    } else if (!isCurrent) {
      eta = `<div class="level-eta level-done">✓ Reached</div>`;
    }

    return `<div class="level-row ${reached ? '' : 'locked'} ${isCurrent ? 'current' : ''}"
                 style="color:${reached ? l.color : ''}">
      <span class="level-badge">${l.icon}</span>
      <div class="level-body">
        <div class="level-name">Level ${l.n}</div>
        <div class="level-desc">${esc(l.desc)}</div>
        <div class="level-meta">
          <span>🕒 Input time: <b>${l.hours.toLocaleString()}h</b></span>
          <span>💬 Known words: <b>${l.words}</b></span>
        </div>
        ${eta}
      </div>
    </div>`;
  }).join('');
}

function renderStats() {
  // The baseline counts towards the total only — it has no date, so it is invisible to
  // every rolling window below.
  const totalSecs = sumSeconds(entries);
  const baselineSecs = sumSeconds(entries.filter((e) => e.kind === 'baseline'));
  const sessions = sessionEntries();

  const todayEntries = sessions.filter((e) => e.date === today);
  const todaySecs = sumSeconds(todayEntries);

  const weekStart = shiftDate(today, -6);
  const weekSecs = sumSeconds(sessions.filter((e) => e.date >= weekStart && e.date <= today));

  $('statTotal').innerHTML = hmMarkup(totalSecs);
  const logged = sessions.length
    ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} logged`
    : 'no sessions yet';
  $('statTotalFoot').textContent = baselineSecs
    ? `${logged} · incl. ${fmtHm(baselineSecs)} baseline`
    : logged;

  $('statToday').innerHTML = hmMarkup(todaySecs);
  $('statTodayFoot').textContent = `${todayEntries.length} session${
    todayEntries.length === 1 ? '' : 's'
  } today`;

  $('statWeek').innerHTML = hmMarkup(weekSecs);
  $('statWeekFoot').textContent = `avg ${fmtHm(weekSecs / 7)}/day`;

  const days = new Set(sessions.map((e) => e.date));
  let streak = 0;
  let cursor = days.has(today) ? today : shiftDate(today, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  $('statStreak').innerHTML = `${streak}<em>d</em>`;
  $('statStreakFoot').textContent = !streak
    ? 'start today!'
    : days.has(today)
    ? 'keep it rolling 🔥'
    : 'log today to extend';
}

function renderChart() {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(shiftDate(today, -i));

  const totals = days.map((d) => sumSeconds(entries.filter((e) => e.date === d)));
  const max = Math.max(...totals, 1800);

  el.chart.innerHTML = days
    .map((d, i) => {
      const secs = totals[i];
      const pct = Math.max((secs / max) * 100, secs > 0 ? 4 : 1.5);
      const [, mo, day] = d.split('-');
      const dt = new Date(Number(d.slice(0, 4)), Number(mo) - 1, Number(day));
      const wd = dt.toLocaleDateString(undefined, { weekday: 'narrow' });
      return `<div class="bar-wrap" title="${prettyDate(d)} — ${fmtHm(secs)}">
          <div class="bar ${secs ? '' : 'zero'} ${d === today ? 'is-today' : ''}"
               style="height:${pct}%;animation-delay:${i * 28}ms">
            <span>${fmtHm(secs)}</span>
          </div>
          <div class="tick"><b>${wd}</b>${Number(day)}</div>
        </div>`;
    })
    .join('');

  $('chartHint').textContent = `peak ${fmtHm(Math.max(...totals, 0))} · total ${fmtHm(
    totals.reduce((a, b) => a + b, 0)
  )}`;
}

function renderLog(flashId) {
  const q = el.search.value.trim().toLowerCase();
  const filter = el.catFilter.value;
  const counts = {};
  entries.forEach((e) => {
    if (e.video_id) counts[e.video_id] = (counts[e.video_id] || 0) + 1;
  });

  const rows = entries
    .filter((e) => !filter || entryCat(e) === filter)
    .filter(
      (e) => !q || (e.title + ' ' + e.channel + ' ' + catMeta(entryCat(e)).label).toLowerCase().includes(q)
    )
    .sort((a, b) => (b.date + b.logged_at).localeCompare(a.date + a.logged_at));

  el.logCount.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;
  el.empty.hidden = rows.length > 0;
  if (!rows.length) {
    el.empty.textContent = entries.length
      ? 'No entries match that filter.'
      : 'Nothing logged yet — paste a YouTube link or log a session above. 🎧';
  }

  el.logBody.innerHTML = rows
    .map((e) => {
      const cat = entryCat(e);
      const rep = counts[e.video_id] > 1 ? `<span class="dup">×${counts[e.video_id]}</span>` : '';

      let cell;
      if (e.kind === 'baseline') {
        cell = `<div class="vid">
               <span class="thumb baseline-thumb">⚑</span>
               <div class="vid-text">
                 <span class="plain-title">${esc(e.title)}</span>
                 <small>counted in the total only</small>
               </div>
             </div>`;
      } else if (cat === 'youtube' && e.video_id) {
        cell = `<div class="vid">
               <img class="thumb" loading="lazy" alt=""
                    src="https://i.ytimg.com/vi/${esc(e.video_id)}/mqdefault.jpg">
               <div class="vid-text">
                 <a href="${esc(e.url)}" target="_blank" rel="noopener"
                    title="${esc(e.title)}">${esc(e.title)}</a>${rep}
                 <small>${esc(e.channel || '—')}</small>
               </div>
             </div>`;
      } else {
        // the chip in the Type column already names the category — don't repeat it here
        const c = catMeta(cat);
        cell = `<div class="vid">
               <span class="thumb cat-thumb" style="--c:${c.color};--c-soft:${c.soft};--c-line:${c.line}">${c.icon}</span>
               <div class="vid-text">
                 <span class="plain-title" title="${esc(e.title)}">${esc(e.title)}</span>
                 <small>logged ${esc((e.logged_at || '').slice(0, 10) || '—')}</small>
               </div>
             </div>`;
      }

      return `<tr data-id="${e.entry_id}" class="${e.entry_id === flashId ? 'flash' : ''}">
        <td class="date">${e.kind === 'baseline' ? '—' : prettyDate(e.date)}</td>
        <td class="type">${catChip(cat)}</td>
        <td>${cell}</td>
        <td class="num hours">${fmtHm(e.duration_seconds)}</td>
        <td class="num"><button class="del" title="Delete entry" aria-label="Delete entry">✕</button></td>
      </tr>`;
    })
    .join('');
}

/* ----------------------------------------------------------------- actions */

async function post(payload) {
  const res = await fetch(api('/api/entries'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { res, data: await res.json() };
}

function askForManualDuration(info, why) {
  pending = { videoId: info.videoId, title: info.title, channel: info.channel };
  openManual('video', why);
  el.mTitle.value = info.title || '';
}

async function submitEntry(payload, btn) {
  busy(true, btn);
  try {
    let { res, data } = await post(payload);

    // The server could not get a duration — let the embedded player try.
    if (res.status === 422 && data.needsBrowserLookup) {
      if (data.isLive) {
        askForManualDuration(data, data.error);
        return;
      }
      flash('Asking the YouTube player for the duration…', 'info');
      try {
        const found = await resolveInBrowser(data.videoId);
        ({ res, data } = await post({
          ...payload,
          durationSeconds: found.seconds,
          title: payload.title || found.title || data.title,
          channel: payload.channel || data.channel || found.channel,
        }));
      } catch (lookupErr) {
        askForManualDuration(data, lookupErr.message + ' Enter the duration yourself.');
        return;
      }
    }

    if (!res.ok) {
      flash(data.error || 'Something went wrong.', 'err');
      return;
    }

    entries.push(data.entry);
    render(data.entry.entry_id);
    flash(`Added “${data.entry.title}” — ${fmtHm(data.entry.duration_seconds)}.`, 'ok');
    el.form.reset();
    el.date.value = today;
    closeManual();
    pending = null;
    (category === 'youtube' ? el.url : el.title).focus();
  } catch (err) {
    flash('Network error: ' + err.message, 'err');
  } finally {
    busy(false, btn);
  }
}

const hmSeconds = (hInput, mInput) =>
  (Number(hInput.value) || 0) * 3600 + (Number(mInput.value) || 0) * 60;

el.form.addEventListener('submit', (ev) => {
  ev.preventDefault();

  if (category === 'youtube') {
    const url = el.url.value.trim();
    if (!url) return flash('Paste a YouTube link first.', 'err');
    return submitEntry({ category, url, date: el.date.value });
  }

  const seconds = hmSeconds(el.cH, el.cM);
  if (seconds <= 0) return flash('Enter how long the session lasted.', 'err');
  submitEntry({
    category,
    date: el.date.value,
    durationSeconds: seconds,
    title: el.title.value.trim(),
  });
});

el.manualSave.addEventListener('click', async () => {
  const secs = hmSeconds(el.mH, el.mM);

  if (manualMode === 'baseline') {
    busy(true, el.manualSave);
    try {
      const res = await fetch(api('/api/baseline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: secs }),
      });
      if (!res.ok) throw new Error('the server refused it');
      await load();
      closeManual();
      flash(secs > 0 ? `Baseline set to ${fmtHm(secs)}.` : 'Baseline removed.', 'ok');
    } catch (err) {
      el.manualMsg.textContent = 'Could not save the baseline: ' + err.message;
    } finally {
      busy(false, el.manualSave);
    }
    return;
  }

  if (secs <= 0) {
    el.manualMsg.textContent = 'Enter a duration greater than zero.';
    return;
  }
  submitEntry(
    {
      category: 'youtube',
      url: pending ? pending.videoId : el.url.value.trim(),
      date: el.date.value,
      durationSeconds: secs,
      title: el.mTitle.value.trim() || (pending && pending.title) || '',
      channel: (pending && pending.channel) || '',
    },
    el.manualSave
  );
});

el.logBody.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.del');
  if (!btn) return;
  const tr = btn.closest('tr');
  const id = tr.dataset.id;
  const entry = entries.find((e) => e.entry_id === id);
  if (!confirm(`Delete this entry?\n\n${entry ? entry.title : ''}`)) return;

  const res = await fetch(api('/api/entries/' + encodeURIComponent(id)), { method: 'DELETE' });
  if (res.ok) {
    entries = entries.filter((e) => e.entry_id !== id);
    render();
    flash('Entry removed.', 'ok');
  } else {
    flash('Could not delete that entry.', 'err');
  }
});

el.search.addEventListener('input', () => renderLog());
el.catFilter.addEventListener('change', () => renderLog());

function closeManual() {
  el.manualBox.hidden = true;
  manualMode = 'video';
  el.mTitleField.hidden = false;
  el.manualSave.querySelector('.btn-label').textContent = 'Save with this duration';
  el.mH.value = el.mM.value = '';
}

function openManual(mode, message) {
  manualMode = mode;
  el.manualBox.hidden = false;
  el.manualMsg.textContent = message;
  el.mTitleField.hidden = mode === 'baseline';
  el.manualSave.querySelector('.btn-label').textContent =
    mode === 'baseline' ? 'Save baseline' : 'Save with this duration';
  el.msg.hidden = true;

  if (mode === 'baseline') {
    const current = entries.find((e) => e.kind === 'baseline');
    const mins = Math.round((current ? current.duration_seconds : 0) / 60);
    el.mH.value = Math.floor(mins / 60) || '';
    el.mM.value = mins % 60 || '';
  }
  el.mH.focus();
}

el.manualToggle.addEventListener('click', () => {
  if (!el.manualBox.hidden && manualMode === 'video') return closeManual();
  openManual('video', 'Enter how long you watched — this overrides whatever YouTube reports.');
});

el.baselineToggle.addEventListener('click', () => {
  if (!el.manualBox.hidden && manualMode === 'baseline') return closeManual();
  openManual(
    'baseline',
    'Immersion you did before tracking started. It counts towards the total only — not today, the week, the streak or the chart. Set it to zero to remove it.'
  );
});

/* ------------------------------------------------------------- daily goal */

function openGoalEditor() {
  const mins = settings.dailyGoalMinutes;
  el.goalH.value = Math.floor(mins / 60) || '';
  el.goalM.value = mins % 60 || '';
  el.goalEditor.hidden = false;
  el.goalNum.hidden = true;
  el.goalH.focus();
  el.goalH.select();
}

function closeGoalEditor() {
  el.goalEditor.hidden = true;
  el.goalNum.hidden = false;
}

async function saveGoal() {
  if (el.goalEditor.hidden) return; // already saved by another handler
  const mins = Math.round(hmSeconds(el.goalH, el.goalM) / 60);
  closeGoalEditor();
  if (!Number.isFinite(mins) || mins < 0 || mins > 1440 || mins === settings.dailyGoalMinutes) {
    return;
  }
  try {
    const res = await fetch(api('/api/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyGoalMinutes: mins }),
    });
    const data = await res.json();
    if (!res.ok) return flash(data.error || 'Could not save the goal.', 'err');
    settings = data.settings;
    render();
    flash(
      settings.dailyGoalMinutes
        ? `Daily goal set to ${fmtHm(settings.dailyGoalMinutes * 60)}.`
        : 'Daily goal cleared.',
      'ok'
    );
  } catch (err) {
    flash('Could not save the goal: ' + err.message, 'err');
  }
}

el.goalEdit.addEventListener('click', () => {
  if (el.goalEditor.hidden) openGoalEditor();
  else saveGoal();
});
el.goalNum.addEventListener('click', openGoalEditor);

// Save when focus leaves the editor entirely — moving between the h and m boxes is fine.
el.goalEditor.addEventListener('focusout', (ev) => {
  if (!el.goalEditor.contains(ev.relatedTarget) && ev.relatedTarget !== el.goalEdit) saveGoal();
});
el.goalEditor.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    saveGoal();
  }
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeGoalEditor();
  }
});

load();
