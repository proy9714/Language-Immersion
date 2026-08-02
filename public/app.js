/* German Immersion Tracker — frontend */

const $ = (id) => document.getElementById(id);

const el = {
  form: $('addForm'), url: $('url'), date: $('date'),
  submitBtn: $('submitBtn'), spinner: document.querySelector('#submitBtn .spinner'),
  btnLabel: document.querySelector('#submitBtn .btn-label'),
  msg: $('msg'),
  manualBox: $('manualBox'), manualMsg: $('manualMsg'), manualSave: $('manualSave'),
  mH: $('mH'), mM: $('mM'), mS: $('mS'), mTitle: $('mTitle'),
  chart: $('chart'), logBody: $('logBody'), logCount: $('logCount'),
  empty: $('empty'), search: $('search'), csvPath: $('csvPath'),
  manualToggle: $('manualToggle'), ytHost: $('ytHost'),
  baselineToggle: $('baselineToggle'), mTitleField: $('mTitleField'),
  goalFill: $('goalFill'), goalNum: $('goalNum'), goalEdit: $('goalEdit'), goalInput: $('goalInput'),
  levelBars: $('levelBars'), levelNow: $('levelNow'), lpTotal: $('lpTotal'), lpFill: $('lpFill'),
  lpFrom: $('lpFrom'), lpTo: $('lpTo'), levelNext: $('levelNext'), levelNextHrs: $('levelNextHrs'),
  statWatched: $('statWatched'), statVideos: $('statVideos'), statDays: $('statDays'),
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
// Active language code. Null until the first load, so the server can pick the one that
// was open last; ?lang=xx in the address bar overrides it.
let lang = new URLSearchParams(location.search).get('lang') || null;
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
const fmtH = (h) => h.toFixed(2);

function fmtClock(secs) {
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
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
  today = data.today;
  if (data.csvPath) el.csvPath.textContent = data.csvPath;
  if (!el.date.value) el.date.value = today;
  renderLanguage();
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
const videoEntries = () => entries.filter((e) => e.kind !== 'baseline');

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
  const todayMins =
    videoEntries()
      .filter((e) => e.date === today)
      .reduce((a, e) => a + e.duration_seconds, 0) / 60;

  const done = Math.round(todayMins);
  const pct = goal > 0 ? Math.min((todayMins / goal) * 100, 100) : 0;
  el.goalFill.style.width = pct + '%';
  el.goalFill.classList.toggle('done', goal > 0 && todayMins >= goal);
  el.goalNum.textContent = goal > 0 ? `${done}/${goal} min` : `${done} min · no goal set`;
}

function renderProgression() {
  const totalH = hours(totalSeconds());
  const current = levelFor(totalH);
  const next = LEVELS.find((l) => l.hours > totalH) || null;

  // seven bars, tallest last; everything up to the current level is lit
  el.levelBars.innerHTML = LEVELS.map((l, i) => {
    const on = l.n <= current.n;
    const h = 30 + i * 11.6;
    return `<div class="lb ${on ? 'on' : ''} ${l.n === current.n ? 'cur' : ''}"
       style="height:${h}%;animation-delay:${i * 45}ms;color:${l.color};${
      on ? `background:${l.color}` : ''
    }" title="Level ${l.n} — ${l.hours} h"></div>`;
  }).join('');

  el.levelNow.textContent = `Level ${current.n}`;
  el.lpTotal.textContent = `${fmtH(totalH)} hrs`;

  const from = current.hours;
  const to = next ? next.hours : current.hours;
  const span = to - from;
  const pct = span > 0 ? Math.min(((totalH - from) / span) * 100, 100) : 100;
  el.lpFill.style.width = pct + '%';
  el.lpFrom.textContent = `${from} hrs`;
  el.lpTo.textContent = next ? `${to} hrs` : 'max';

  if (next) {
    el.levelNext.hidden = false;
    el.levelNext.firstElementChild.textContent = `Hours to level ${next.n}`;
    el.levelNextHrs.textContent = `${fmtH(next.hours - totalH)} hrs`;
  } else {
    el.levelNext.hidden = false;
    el.levelNext.firstElementChild.textContent = 'Highest level reached';
    el.levelNextHrs.textContent = '🎉';
  }
}

function renderStatistics() {
  const videos = videoEntries();
  const watchedH = hours(videos.reduce((a, e) => a + e.duration_seconds, 0));
  const days = new Set(videos.map((e) => e.date).filter(Boolean));

  el.statWatched.textContent = fmtH(watchedH);
  el.statVideos.textContent = videos.length;
  el.statDays.textContent = days.size;
}

function renderLevels() {
  const totalH = hours(totalSeconds());
  const current = levelFor(totalH);

  el.levelsHint.textContent =
    settings.dailyGoalMinutes > 0
      ? `projections based on ${settings.dailyGoalMinutes} min/day`
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
          <span>🕒 Hours of input: <b>${l.hours.toLocaleString()}</b></span>
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
  const totalH = hours(entries.reduce((a, e) => a + e.duration_seconds, 0));
  const baselineH = hours(
    entries.filter((e) => e.kind === 'baseline').reduce((a, e) => a + e.duration_seconds, 0)
  );
  const videos = entries.filter((e) => e.kind !== 'baseline');

  const todayEntries = videos.filter((e) => e.date === today);
  const todayH = hours(todayEntries.reduce((a, e) => a + e.duration_seconds, 0));

  const weekStart = shiftDate(today, -6);
  const weekEntries = videos.filter((e) => e.date >= weekStart && e.date <= today);
  const weekH = hours(weekEntries.reduce((a, e) => a + e.duration_seconds, 0));

  $('statTotal').innerHTML = `${fmtH(totalH)}<em>h</em>`;
  const sessions = videos.length
    ? `${videos.length} session${videos.length === 1 ? '' : 's'} logged`
    : 'no sessions yet';
  $('statTotalFoot').textContent = baselineH
    ? `${sessions} · incl. ${fmtH(baselineH)} h baseline`
    : sessions;

  $('statToday').innerHTML = `${fmtH(todayH)}<em>h</em>`;
  $('statTodayFoot').textContent = `${todayEntries.length} video${
    todayEntries.length === 1 ? '' : 's'
  } today`;

  $('statWeek').innerHTML = `${fmtH(weekH)}<em>h</em>`;
  $('statWeekFoot').textContent = `avg ${fmtH(weekH / 7)} h/day`;

  const days = new Set(videos.map((e) => e.date));
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

  const totals = days.map((d) =>
    hours(entries.filter((e) => e.date === d).reduce((a, e) => a + e.duration_seconds, 0))
  );
  const max = Math.max(...totals, 0.5);

  el.chart.innerHTML = days
    .map((d, i) => {
      const h = totals[i];
      const pct = Math.max((h / max) * 100, h > 0 ? 4 : 1.5);
      const [, mo, day] = d.split('-');
      const dt = new Date(Number(d.slice(0, 4)), Number(mo) - 1, Number(day));
      const wd = dt.toLocaleDateString(undefined, { weekday: 'narrow' });
      return `<div class="bar-wrap" title="${prettyDate(d)} — ${fmtH(h)} h">
          <div class="bar ${h ? '' : 'zero'} ${d === today ? 'is-today' : ''}"
               style="height:${pct}%;animation-delay:${i * 28}ms">
            <span>${fmtH(h)}h</span>
          </div>
          <div class="tick"><b>${wd}</b>${Number(day)}</div>
        </div>`;
    })
    .join('');

  $('chartHint').textContent = `peak ${fmtH(max)} h · total ${fmtH(
    totals.reduce((a, b) => a + b, 0)
  )} h`;
}

function renderLog(flashId) {
  const q = el.search.value.trim().toLowerCase();
  const counts = {};
  entries.forEach((e) => {
    if (e.video_id) counts[e.video_id] = (counts[e.video_id] || 0) + 1;
  });

  const rows = entries
    .filter((e) => !q || (e.title + ' ' + e.channel).toLowerCase().includes(q))
    .sort((a, b) => (b.date + b.logged_at).localeCompare(a.date + a.logged_at));

  el.logCount.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;
  el.empty.hidden = entries.length > 0;
  el.empty.textContent = entries.length
    ? ''
    : 'Nothing logged yet — paste a YouTube link above to begin. 🎧';
  if (!rows.length && q) {
    el.empty.hidden = false;
    el.empty.textContent = 'No entries match that search.';
  }

  el.logBody.innerHTML = rows
    .map((e) => {
      const rep = counts[e.video_id] > 1 ? `<span class="dup">×${counts[e.video_id]}</span>` : '';
      const cell =
        e.kind === 'baseline'
          ? `<div class="vid">
               <span class="thumb baseline-thumb">⚑</span>
               <div>
                 <span class="baseline-title">${esc(e.title)}</span>
                 <span class="dup">baseline</span>
                 <small>counted in the total only</small>
               </div>
             </div>`
          : `<div class="vid">
               <img class="thumb" loading="lazy" alt=""
                    src="https://i.ytimg.com/vi/${esc(e.video_id)}/mqdefault.jpg">
               <div>
                 <a href="${esc(e.url)}" target="_blank" rel="noopener"
                    title="${esc(e.title)}">${esc(e.title)}</a>${rep}
                 <small>${esc(e.channel || '—')}</small>
               </div>
             </div>`;

      return `<tr data-id="${e.entry_id}" class="${e.entry_id === flashId ? 'flash' : ''}">
        <td class="date">${e.kind === 'baseline' ? '—' : prettyDate(e.date)}</td>
        <td>${cell}</td>
        <td class="num hours">${fmtH(hours(e.duration_seconds))}</td>
        <td class="num">${fmtClock(e.duration_seconds)}</td>
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
    flash(
      `Added “${data.entry.title}” — ${fmtH(hours(data.entry.duration_seconds))} h.`,
      'ok'
    );
    el.form.reset();
    el.date.value = today;
    closeManual();
    pending = null;
    el.url.focus();
  } catch (err) {
    flash('Network error: ' + err.message, 'err');
  } finally {
    busy(false, btn);
  }
}

el.form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const url = el.url.value.trim();
  if (!url) return;
  submitEntry({ url, date: el.date.value });
});

el.manualSave.addEventListener('click', async () => {
  const secs =
    (Number(el.mH.value) || 0) * 3600 + (Number(el.mM.value) || 0) * 60 + (Number(el.mS.value) || 0);

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
      flash(
        secs > 0
          ? `Baseline set to ${fmtH(hours(secs))} h.`
          : 'Baseline removed.',
        'ok'
      );
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

function closeManual() {
  el.manualBox.hidden = true;
  manualMode = 'video';
  el.mTitleField.hidden = false;
  el.manualSave.textContent = 'Save with this duration';
  el.mH.value = el.mM.value = el.mS.value = '';
}

function openManual(mode, message) {
  manualMode = mode;
  el.manualBox.hidden = false;
  el.manualMsg.textContent = message;
  el.mTitleField.hidden = mode === 'baseline';
  el.manualSave.textContent = mode === 'baseline' ? 'Save baseline' : 'Save with this duration';
  el.msg.hidden = true;

  if (mode === 'baseline') {
    const current = entries.find((e) => e.kind === 'baseline');
    const secs = current ? current.duration_seconds : 0;
    el.mH.value = Math.floor(secs / 3600) || '';
    el.mM.value = Math.floor((secs % 3600) / 60) || '';
    el.mS.value = secs % 60 || '';
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
  el.goalInput.value = settings.dailyGoalMinutes;
  el.goalInput.hidden = false;
  el.goalNum.hidden = true;
  el.goalInput.focus();
  el.goalInput.select();
}

function closeGoalEditor() {
  el.goalInput.hidden = true;
  el.goalNum.hidden = false;
}

async function saveGoal() {
  if (el.goalInput.hidden) return; // already saved by another handler
  const mins = Number(el.goalInput.value);
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
        ? `Daily goal set to ${settings.dailyGoalMinutes} min.`
        : 'Daily goal cleared.',
      'ok'
    );
  } catch (err) {
    flash('Could not save the goal: ' + err.message, 'err');
  }
}

el.goalEdit.addEventListener('click', () => {
  if (el.goalInput.hidden) openGoalEditor();
  else saveGoal();
});
el.goalNum.addEventListener('click', openGoalEditor);
el.goalInput.addEventListener('blur', saveGoal);
el.goalInput.addEventListener('keydown', (ev) => {
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
