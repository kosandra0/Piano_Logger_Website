/* Piano Logger Cloud Dashboard (read-only). Shows what the Piano Logger apps synced to the user's account.
   Nothing here writes statistics. Plain JavaScript, no library, no inline styles (the page's Content-Security-Policy forbids them).
   The numbers come from stats-core.js (the app's own rules, tested for parity).
   cs-core.js and cs-net.js are copies of tools/v920/cs-core.js and cs-net.js (tests/v920/dashboard.files.test.js fails if they drift). */
(() => {
  'use strict';
  // the project address and its PUBLIC key (the database rules, not this key, protect everyone's data)
  const CFG = { url: 'https://rrlfnghoxocplelqigdc.supabase.co', key: 'sb_publishable_j1cAUpJiW1hqJcKDD9Kk7Q_0jOaV7o6' };
  const K = { session: 'plc.session', cache: 'plc.cache.', oauth: 'plc.oauth' };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };
  const net = CSN.create({ url: CFG.url, key: CFG.key, store: { get: () => ls.get(K.session), set: v => ls.set(K.session, v), clear: () => ls.del(K.session) } });
  const S = { view: 'overview', data: null, err: '', loading: false, mode: 'in', msg: '', tone: '', metric: 'ms', range: 30, openDay: null, dayBusy: false, daySess: {}, sess: null, sessErr: '', sessBusy: false, openSess: null, offlineAt: 0, cap: '', dayLimit: 40, busy: false, recovery: false };
  const today = () => CSC.dayOf(Date.now());
  const ago = ts => { const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
  const prettyDay = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  const shortDay = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  const hhmm = ts => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const nice = e => { const m = String((e && e.message) || e || ''); return e && e.kind === 'offline' ? 'You seem to be offline.' : /Invalid login/i.test(m) ? 'That email and password do not match.' : /already registered/i.test(m) ? 'There is already an account with that email. Try signing in.' : /not confirmed/i.test(m) ? 'Please open the link in the email we sent you first, then sign in.' : /rate limit|too many/i.test(m) ? 'Too many tries. Please wait a little and try again.' : (m || 'Something went wrong.'); };
  const ICON = {
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
    sessions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
    devices: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
  };
  const TABS = [['overview', 'Overview'], ['history', 'History'], ['sessions', 'Sessions'], ['devices', 'Devices']];
  const userId = () => (net.user() || {}).id || '';

  /* ---------- data ---------- */
  async function load() {
    S.loading = true; S.err = ''; paint();
    const uid = userId();
    try {
      const [devices, daily] = await Promise.all([
        net.selectAll('devices', 'select=id,name,platform,app_version,last_sync_ok,days_total,days_uploaded,revoked_at&order=first_seen.asc'),
        net.selectAll('daily_stats', 'select=device_id,day,presses,active_ms,hours&deleted_at=is.null&order=day.asc')
      ]);
      S.data = { at: Date.now(), devices, daily }; S.offlineAt = 0; S.sess = null; S.daySess = {};
      ls.set(K.cache + uid, S.data);
    } catch (e) {
      if (e && e.kind === 'auth') { S.data = null; }
      else {
        const c = ls.get(K.cache + uid);
        if (c && (e.kind === 'offline' || e.kind === 'server')) { S.data = c; S.offlineAt = c.at; } else S.err = nice(e);
      }
    }
    S.loading = false; paint();
  }
  async function loadSessions() {
    if (S.sess || S.sessBusy) return; S.sessBusy = true; S.sessErr = ''; paint();
    try { S.sess = await net.select('practice_sessions', 'select=device_id,start_ts,end_ts,presses,active_ms,day&deleted_at=is.null&order=start_ts.desc&limit=300'); }
    catch (e) { S.sessErr = nice(e); }
    S.sessBusy = false; paint();
  }
  async function loadDaySessions(day) {
    if (S.daySess[day]) return; S.dayBusy = true; paint();
    try { S.daySess[day] = await net.select('practice_sessions', 'select=device_id,start_ts,end_ts,presses,active_ms&deleted_at=is.null&day=eq.' + day + '&order=start_ts.asc'); }
    catch (e) { S.daySess[day] = []; }
    S.dayBusy = false; paint();
  }

  /* ---------- pieces ---------- */
  const devName = id => { const d = S.data && S.data.devices.find(x => x.id === id); return d ? d.name : 'A device'; };
  function banners() {
    let h = '';
    if (S.offlineAt) h += '<div class="ban" data-tone="info" role="status"><i></i><div><b>Offline.</b> Showing the numbers saved ' + esc(ago(S.offlineAt)) + '. They may be out of date.</div><button class="btn sm" data-a="refresh">Try again</button></div>';
    for (const d of S.data.devices) {
      if (d.revoked_at) continue;
      if (d.days_total && d.days_uploaded < d.days_total) h += '<div class="ban" data-tone="warn" role="status"><i></i><div><b>' + esc(d.name) + ' is still uploading its history</b> (' + (+d.days_uploaded || 0) + ' of ' + (+d.days_total || 0) + ' days). The totals below are not complete yet and will grow.</div></div>';
      else if (d.last_sync_ok && Date.now() - Date.parse(d.last_sync_ok) > 7 * 864e5) h += '<div class="ban" data-tone="info"><i></i><div><b>' + esc(d.name) + '</b> has not synced for ' + esc(ago(Date.parse(d.last_sync_ok)).replace(' ago', '')) + '. Open Piano Logger on it to bring the numbers up to date.</div></div>';
    }
    return h;
  }
  function barChart(items, metric) {
    const W = 640, H = 210, pl = 4, pr = 4, pt = 12, pb = 24, n = items.length, max = Math.max(1, ...items.map(x => x.value)), bw = (W - pl - pr) / n, ph = H - pt - pb;
    const step = n <= 7 ? 1 : n <= 30 ? 5 : n <= 90 ? 15 : 60;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart of the last ' + n + ' days"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>';
    for (const f of [0, .5, 1]) s += '<line class="gl" x1="0" x2="' + W + '" y1="' + (pt + ph - ph * f) + '" y2="' + (pt + ph - ph * f) + '"/>';
    items.forEach((it, i) => {
      const h = it.value ? Math.max(2, it.value / max * ph) : 0;
      s += '<rect class="bar" data-a="bar" data-i="' + i + '" x="' + (pl + i * bw + Math.min(1.5, bw * .12)).toFixed(1) + '" y="' + (pt + ph - h).toFixed(1) + '" width="' + Math.max(1, bw - Math.min(3, bw * .24)).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + esc(shortDay(it.day) + ': ' + (metric === 'ms' ? PLStats.hm(it.value) : PLStats.num(it.value) + ' key presses')) + '</title></rect>';
      if (i % step === (n - 1) % step) s += '<text class="ax" x="' + (pl + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(shortDay(it.day)) + '</text>';
    });
    return s + '<text class="ax" x="' + (W - 2) + '" y="10" text-anchor="end">' + esc(metric === 'ms' ? PLStats.hm(max) : PLStats.num(max)) + '</text></svg>';
  }
  function hoursChart(hours) {
    const W = 480, H = 110, max = Math.max(1, ...hours), bw = W / 24;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Key presses by hour of the day"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>';
    hours.forEach((v, i) => { const h = v ? Math.max(2, v / max * 80) : 0; s += '<rect class="bar" x="' + (i * bw + 1.5).toFixed(1) + '" y="' + (86 - h).toFixed(1) + '" width="' + (bw - 3).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + String(i).padStart(2, '0') + ':00 · ' + PLStats.num(v) + ' key presses</title></rect>'; });
    for (const h of [0, 6, 12, 18]) s += '<text class="ax" x="' + (h === 0 ? 2 : h * bw + bw / 2).toFixed(1) + '" y="104" text-anchor="' + (h === 0 ? 'start' : 'middle') + '">' + String(h).padStart(2, '0') + ':00</text>';
    return s + '</svg>';
  }
  function heatmap(byDay) {
    const weeks = window.innerWidth < 560 ? 26 : 52, H = PLStats.heat(byDay, today(), weeks);
    let s = '<div class="heat-wrap" id="heatWrap"><div class="heat" role="img" aria-label="Practice calendar, the last ' + weeks + ' weeks">';
    for (const col of H.cols) for (const c of col) s += c.value === null ? '<i data-future="1"></i>' : '<i data-l="' + PLStats.level(c.value, H.max) + '" data-a="cell" data-day="' + c.day + '" data-v="' + c.value + '" title="' + esc(prettyDay(c.day) + ': ' + PLStats.num(c.value) + ' key presses') + '"></i>';
    return s + '</div></div>';
  }
  const stat = (label, big, sub, cls) => '<div class="stat' + (cls ? ' ' + cls : '') + '"><small>' + esc(label) + '</small><b>' + esc(big) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</div>';
  const periodStat = (label, p) => stat(label, PLStats.hm(p.ms), PLStats.num(p.presses) + ' key presses');

  /* ---------- views ---------- */
  function emptyState() { return '<div class="empty card"><h2>Nothing to show yet</h2><p>Open Piano Logger on your computer, go to <b>Cloud sync</b> and sign in with this account. Your totals appear here after its first sync.</p><button class="btn" data-a="refresh">Check again</button></div>'; }
  function viewOverview(byDay, SUM) {
    const items = PLStats.series(byDay, today(), S.range, S.metric), tot = items.reduce((a, x) => a + x.value, 0);
    const seg = (name, list, cur) => '<div class="seg" role="group" aria-label="' + name + '">' + list.map(([v, l]) => '<button type="button" data-a="' + (name === 'Show' ? 'metric' : 'range') + '" data-v="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + l + '</button>').join('') + '</div>';
    return '<div class="stats">' + stat('Total practice time', PLStats.hm(SUM.total.ms), PLStats.num(SUM.total.presses) + ' key presses on ' + PLStats.num(SUM.total.days) + ' days', 'hero') +
      periodStat('Today', SUM.today) + periodStat('This week', SUM.week) + periodStat('This month', SUM.month) + periodStat('This year', SUM.year) +
      stat('Streak now', SUM.streak.cur + (SUM.streak.cur === 1 ? ' day' : ' days'), 'Best: ' + SUM.streak.best + (SUM.streak.best === 1 ? ' day' : ' days')) +
      stat('Best day', SUM.bestDay ? PLStats.num(SUM.bestDay.presses) : '0', SUM.bestDay ? prettyDay(SUM.bestDay.day) : '') +
      stat('Average practice day', PLStats.num(SUM.avgPerPlayedDay), 'key presses') + '</div>' +
      '<div class="grid2"><section class="card"><h2>Recent days</h2>' + seg('Show', [['ms', 'Practice time'], ['presses', 'Key presses']], S.metric) + seg('Range', [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']], S.range) +
      barChart(items, S.metric) + '<div class="cap" id="cap" role="status">' + esc(S.cap || 'Total for these ' + S.range + ' days: ' + (S.metric === 'ms' ? PLStats.hm(tot) : PLStats.num(tot) + ' key presses') + '. Tap a bar for one day.') + '</div></section>' +
      '<section class="card"><h2>When you play</h2><p class="fine">All your key presses by hour of the day.</p>' + hoursChart(SUM.hours) + '</section></div>' +
      '<section class="card"><h2>Practice calendar</h2>' + heatmap(byDay) + '<div class="cap" id="hcap" role="status">Tap a square to see that day.</div></section>';
  }
  function viewHistory(byDay) {
    const days = Object.keys(byDay).filter(k => byDay[k].presses > 0).sort().reverse(), shown = days.slice(0, S.dayLimit);
    if (!days.length) return emptyState();
    let h = '<h2>Every practice day</h2><ul class="list">';
    for (const k of shown) {
      const d = byDay[k], n = Object.keys(d.devices).length, open = S.openDay === k;
      h += '<li><button class="row" data-a="day" data-day="' + k + '" aria-expanded="' + open + '"><span><b>' + esc(prettyDay(k)) + '</b><small>' + (n > 1 ? n + ' devices' : esc(devName(Object.keys(d.devices)[0]))) + '</small></span><span class="r"><b>' + esc(PLStats.hm(d.active_ms)) + '</b><small>' + PLStats.num(d.presses) + ' key presses</small></span></button>';
      if (open) {
        h += '<div class="det">' + hoursChart(d.hours) + '<p class="fine">' + Object.entries(d.devices).map(([id, p]) => esc(devName(id)) + ': ' + PLStats.num(p) + ' key presses').join(' · ') + '</p>';
        const ss = S.daySess[k]; h += ss ? (ss.length ? '<h3>Sessions</h3>' + ss.map(sessionLine).join('') : '<p class="fine">No sessions are listed for this day.</p>') : '<p class="fine">' + (S.dayBusy ? 'Loading sessions…' : '') + '</p>';
        h += '</div>';
      }
      h += '</li>';
    }
    h += '</ul>';
    if (days.length > shown.length) h += '<button class="btn block" data-a="more">Show more days (' + (days.length - shown.length) + ' older)</button>';
    return h;
  }
  const sessionLine = s => '<p class="fine"><b>' + esc(hhmm(s.start_ts)) + ' to ' + esc(hhmm(s.end_ts)) + '</b> · ' + esc(PLStats.hm(Math.max(0, s.end_ts - s.start_ts))) + ' · ' + PLStats.num(s.presses) + ' key presses · ' + esc(devName(s.device_id)) + '</p>';
  function viewSessions() {
    if (S.sessErr) return '<div class="ban" data-tone="bad"><i></i><div>' + esc(S.sessErr) + '</div><button class="btn sm" data-a="retrysess">Retry</button></div>';
    if (!S.sess) return '<div class="sk h2"></div><div class="sk h2"></div><div class="sk h2"></div>';
    if (!S.sess.length) return emptyState();
    const st = PLStats.sessionStats(S.sess);
    let h = '<div class="stats">' + stat('Sessions listed', PLStats.num(st.count), 'the latest ' + (S.sess.length >= 300 ? '300' : 'ones')) + stat('Average session', PLStats.hm(st.avgMs), '') + stat('Longest session', PLStats.hm(st.longestMs), '') + '</div><ul class="list">';
    S.sess.forEach((s, i) => {
      const open = S.openSess === i, mins = Math.max(1, (s.end_ts - s.start_ts) / 60000);
      h += '<li><button class="row" data-a="sess" data-i="' + i + '" aria-expanded="' + open + '"><span><b>' + esc(new Date(s.start_ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + esc(hhmm(s.start_ts)) + '</b><small>' + esc(devName(s.device_id)) + '</small></span><span class="r"><b>' + esc(PLStats.hm(s.end_ts - s.start_ts)) + '</b><small>' + PLStats.num(s.presses) + ' key presses</small></span></button>' +
        (open ? '<div class="det"><p>From <b>' + esc(hhmm(s.start_ts)) + '</b> to <b>' + esc(hhmm(s.end_ts)) + '</b></p><p>Time spent playing: <b>' + esc(PLStats.hm(s.active_ms)) + '</b> · about <b>' + PLStats.num(s.presses / mins) + '</b> key presses a minute</p></div>' : '') + '</li>';
    });
    return h + '</ul><p class="fine">A session ends after 5 minutes without a key press, or at midnight.</p>';
  }
  function viewDevices() {
    const ds = S.data.devices; if (!ds.length) return emptyState();
    return '<h2>Your devices</h2>' + ds.map(d => '<div class="dev' + (d.revoked_at ? ' off' : '') + '"><b>' + esc(d.name) + '</b>' + (d.revoked_at ? '<span class="pill">disconnected</span>' : '') + '<br><span class="fine">' + (d.platform === 'windows-app' ? 'Windows app' : 'Web browser') + ' · version ' + esc(d.app_version || '?') + ' · last synced ' + esc(d.last_sync_ok ? ago(Date.parse(d.last_sync_ok)) : 'never') + '</span>' +
      (d.days_total ? '<progress class="prog" max="' + (+d.days_total || 0) + '" value="' + Math.min(+d.days_total || 0, +d.days_uploaded || 0) + '" aria-label="Days uploaded"></progress><span class="fine">' + (+d.days_uploaded || 0) + ' of ' + (+d.days_total || 0) + ' days uploaded</span>' : '') + '</div>').join('') +
      '<p class="fine">Devices are added and removed in Piano Logger, under Cloud sync.</p>';
  }
  function viewAuth() {
    return '<section class="card auth"><h1>Your practice, anywhere</h1><p class="mut">Sign in with the account you use for Cloud sync in Piano Logger to see your statistics on this device.</p>' +
      '<div class="tabs-in" role="tablist"><button type="button" role="tab" data-a="mode" data-v="in" aria-selected="' + (S.mode === 'in') + '">Sign in</button><button type="button" role="tab" data-a="mode" data-v="up" aria-selected="' + (S.mode === 'up') + '">Create account</button></div>' +
      '<label class="f">Email<input id="em" type="email" autocomplete="email" inputmode="email" spellcheck="false"></label>' +
      '<label class="f">Password' + (S.mode === 'up' ? ' (at least 10 characters)' : '') + '<input id="pw" type="password" autocomplete="' + (S.mode === 'up' ? 'new-password' : 'current-password') + '"></label>' +
      '<div class="msg" id="msg" role="status" data-tone="' + esc(S.tone) + '">' + esc(S.msg) + '</div>' +
      '<button class="btn primary block" id="go" data-a="go">' + (S.mode === 'up' ? 'Create account' : 'Sign in') + '</button>' +
      (S.mode === 'in' ? '<p class="ctr"><button class="btn sm" data-a="forgot">Forgot password?</button></p>' : '') +
      '<div class="or">or</div><button class="btn block" data-a="google">Continue with Google</button>' +
      '<p class="fine mt">This page only shows totals and practice sessions. Piano Logger works fully without an account; this is optional.</p></section>';
  }
  // the page a password-reset e-mail leads to: the person is already signed in by the link, and chooses a new password
  function viewRecovery() {
    return '<section class="card auth"><h1>Choose a new password</h1><p class="mut">You opened the link from your email, so you are signed in as <b>' + esc((net.user() || {}).email || '') + '</b>. Choose a password with at least 10 characters.</p>' +
      '<label class="f">New password<input id="np1" type="password" autocomplete="new-password"></label><label class="f">Type it again<input id="np2" type="password" autocomplete="new-password"></label>' +
      '<div class="msg" id="msg" role="status" data-tone="' + esc(S.tone) + '">' + esc(S.msg) + '</div><button class="btn primary block" data-a="setpw">Save the new password</button>' +
      '<p class="ctr"><button class="btn sm" data-a="skippw">Not now</button></p></section>';
  }
  // two-step sign-in: the account has an authenticator app and this session has not typed its code yet (also shown first when a password-reset link was opened)
  function viewMfa() {
    const m = net.mfaState(), who = '<p class="mut">Signed in as <b>' + esc((net.user() || {}).email || '') + '</b>.</p>';
    if (!m.known || !m.levelKnown) return '<section class="card auth"><h1>Checking your sign-in…</h1>' + who + '<div class="msg" id="msg" role="status" data-tone="' + esc(S.tone) + '">' + esc(S.msg) + '</div><p class="ctr"><button class="btn sm" data-a="mfaretry">Try again</button> <button class="btn sm" data-a="out">Sign out</button></p></section>';
    const lock = S.mfaLock && S.mfaLock > Date.now();
    return '<section class="card auth"><h1>Enter your authenticator code</h1>' + who +
      '<p class="mut">This account is protected with an authenticator app. Type the current 6-digit code' + (S.recovery ? ' before you choose a new password' : '') + '. Nothing is shown until you do.</p>' +
      (m.factors.length > 1 ? '<label class="f">Authenticator<select id="mfaFactor">' + m.factors.map(f => '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>').join('') + '</select></label>' : '') +
      '<label class="f">6-digit code<input id="mfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" spellcheck="false"' + (lock ? ' disabled' : '') + '></label>' +
      '<div class="msg" id="msg" role="status" data-tone="' + esc(S.tone) + '">' + esc(S.msg) + '</div>' +
      '<button class="btn primary block" id="mfaGo" data-a="mfago"' + (lock ? ' disabled' : '') + '>Verify</button>' +
      '<p class="ctr"><button class="btn sm" data-a="out">Sign out</button></p>' +
      '<p class="fine mt">Cannot get a code? This account stays locked here until its authenticator is removed by whoever runs the service.</p></section>';
  }
  async function settle() { try { await net.mfaStatus(); } catch (e) { S.msg = 'Signed in, but your account security could not be checked: ' + nice(e); S.tone = 'bad'; } }
  function skeleton() { return '<div class="sk h1"></div><div class="stats"><div class="sk h2"></div><div class="sk h2"></div><div class="sk h2"></div><div class="sk h2"></div></div><div class="sk h3"></div>'; }

  /* ---------- painting ---------- */
  function paint() {
    const app = $('#app'), tabs = $('#tabs'), topR = $('#topR'), user = net.user();
    topR.innerHTML = user ? '<span class="who" title="' + esc(user.email || '') + '">' + esc(user.email || '') + '</span><button class="btn sm" data-a="refresh" aria-label="Refresh the numbers">↻</button><button class="btn sm" data-a="out">Sign out</button>' : '';
    if (net.signedIn() && !net.mfaOk()) { tabs.hidden = true; app.innerHTML = viewMfa(); const c = $('#mfaCode'); if (c) c.focus(); return; }       // nothing of the account is shown or loaded before the code is checked
    if (net.signedIn() && S.recovery) { tabs.hidden = true; app.innerHTML = viewRecovery(); return; }
    if (!net.signedIn()) { tabs.hidden = true; app.innerHTML = viewAuth(); return; }
    tabs.hidden = false;
    tabs.innerHTML = TABS.map(([v, l]) => '<button type="button" data-a="tab" data-v="' + v + '"' + (S.view === v ? ' aria-current="page"' : '') + '>' + ICON[v] + '<span>' + l + '</span></button>').join('');
    if (S.loading && !S.data) { app.innerHTML = skeleton(); return; }
    if (S.err && !S.data) { app.innerHTML = '<div class="ban" data-tone="bad" role="alert"><i></i><div><b>Could not load your numbers.</b> ' + esc(S.err) + '</div><button class="btn sm" data-a="refresh">Try again</button></div>'; return; }
    if (!S.data) { app.innerHTML = skeleton(); return; }
    const byDay = PLStats.mergeDaily(S.data.daily), SUM = PLStats.summarize(byDay, today()), has = SUM.total.presses > 0;
    let h = banners();
    if (!has && S.view !== 'devices') h += emptyState();
    else h += S.view === 'overview' ? viewOverview(byDay, SUM) : S.view === 'history' ? viewHistory(byDay) : S.view === 'sessions' ? viewSessions() : viewDevices();
    app.innerHTML = h;
    const hw = $('#heatWrap'); if (hw) hw.scrollLeft = hw.scrollWidth;
    if (S.view === 'sessions' && !S.sess && !S.sessBusy && !S.sessErr) loadSessions();
  }

  /* ---------- actions ---------- */
  async function guard(fn) { if (S.busy) return; S.busy = true; try { await fn(); } catch (e) { S.msg = nice(e); S.tone = 'bad'; const m = $('#msg'); if (m) { m.textContent = S.msg; m.dataset.tone = 'bad'; } } finally { S.busy = false; } }
  function setMsg(t, tone) { S.msg = t; S.tone = tone || ''; const m = $('#msg'); if (m) { m.textContent = t; m.dataset.tone = S.tone; } }
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, v = el.dataset.v;
    if (a === 'tab') { S.view = v; S.openDay = null; S.openSess = null; paint(); window.scrollTo(0, 0); return; }
    if (a === 'refresh') { load(); return; }
    if (a === 'metric') { S.metric = v; S.cap = ''; paint(); return; }
    if (a === 'range') { S.range = +v; S.cap = ''; paint(); return; }
    if (a === 'more') { S.dayLimit += 60; paint(); return; }
    if (a === 'bar') { const it = PLStats.series(PLStats.mergeDaily(S.data.daily), today(), S.range, S.metric)[+el.dataset.i]; S.cap = prettyDay(it.day) + ': ' + (S.metric === 'ms' ? PLStats.hm(it.value) : PLStats.num(it.value) + ' key presses'); const c = $('#cap'); if (c) c.textContent = S.cap; return; }
    if (a === 'cell') { const c = $('#hcap'); if (c) c.textContent = prettyDay(el.dataset.day) + ': ' + PLStats.num(+el.dataset.v) + ' key presses'; return; }
    if (a === 'day') { S.openDay = S.openDay === el.dataset.day ? null : el.dataset.day; paint(); if (S.openDay) loadDaySessions(S.openDay); return; }
    if (a === 'sess') { S.openSess = S.openSess === +el.dataset.i ? null : +el.dataset.i; paint(); return; }
    if (a === 'retrysess') { S.sessErr = ''; loadSessions(); return; }
    if (a === 'out') { const uid = userId(); net.signOut('local').then(() => { ls.del(K.cache + uid); S.data = null; S.sess = null; S.err = ''; S.view = 'overview'; S.openDay = null; S.openSess = null; S.daySess = {}; S.dayLimit = 40; S.cap = ''; S.offlineAt = 0; S.recovery = false; S.msg = ''; paint(); }); return; }
    if (a === 'mode') { S.mode = v; S.msg = ''; paint(); return; }
    if (a === 'mfaretry') return guard(async () => { S.msg = ''; await settle(); paint(); if (net.mfaOk() && !S.recovery) load(); });
    if (a === 'mfago') return guard(async () => {
      if (S.mfaLock && S.mfaLock > Date.now()) return setMsg('Too many wrong codes. Please wait a moment and try again.', 'bad');
      const m = net.mfaState(), sel = $('#mfaFactor'), fid = sel ? sel.value : (m.factors[0] || {}).id;
      if (!fid) return setMsg('No authenticator was found on this account.', 'bad');
      setMsg('Checking the code…');
      try { await net.mfaVerify(fid, ($('#mfaCode') || {}).value || ''); }
      catch (e) {
        if (e && e.code === 'mfa_code_wrong' && (S.mfaFails = (S.mfaFails || 0) + 1) >= 5) { S.mfaFails = 0; S.mfaLock = Date.now() + 30000; paint(); setMsg('Too many wrong codes. Please wait 30 seconds and try again.', 'bad'); setTimeout(() => { if (!S.mfaLock || S.mfaLock <= Date.now()) paint(); }, 30500); return; }
        throw e;
      }
      S.mfaFails = 0; S.msg = ''; S.data = null; paint(); if (!S.recovery) load();
    });
    if (a === 'skippw') { S.recovery = false; S.msg = ''; paint(); load(); return; }
    if (a === 'setpw') return guard(async () => {
      const p1 = $('#np1').value || '', p2 = $('#np2').value || '';
      if (p1.length < 10) return setMsg('Please choose a password with at least 10 characters.', 'bad');
      if (p1 !== p2) return setMsg('The two passwords are not the same.', 'bad');
      setMsg('Saving…'); await net.updatePassword(p1);
      S.recovery = false; S.msg = 'Your new password is saved. You are signed in.'; S.tone = 'ok'; paint(); load();
    });
    if (a === 'go') return guard(async () => {
      const email = ($('#em').value || '').trim(), pw = $('#pw').value || '';
      if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg('Please type a valid email address.', 'bad');
      if (S.mode === 'up') {
        if (pw.length < 10) return setMsg('Please choose a password with at least 10 characters.', 'bad');
        setMsg('Creating your account…'); const r = await net.signUp(email, pw, location.origin + location.pathname);
        if (r.needsConfirm) return setMsg('Almost done: we sent an email to ' + email + '. Open the link in it, then come back and sign in.', 'ok');
      } else { setMsg('Signing in…'); await net.signIn(email, pw); }
      await settle(); S.msg = ''; S.data = null; paint(); if (net.mfaOk()) load();
    });
    if (a === 'forgot') return guard(async () => { const email = ($('#em').value || '').trim(); if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg('Type your email first, then press "Forgot password?".', 'bad'); await net.recover(email, location.origin + location.pathname); setMsg('If that address has an account, we sent it a link to choose a new password.', 'ok'); });
    if (a === 'google') return guard(async () => {
      const o = await net.oauthStart('google', location.origin + location.pathname);
      try { sessionStorage.setItem(K.oauth, JSON.stringify({ verifier: o.verifier, state: o.state })); } catch (e) { throw new Error('This browser blocks the storage that Google sign-in needs.'); }
      location.href = o.url;
    });
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && (ev.target.id === 'pw' || ev.target.id === 'em') && !net.signedIn()) { const b = $('#go'); if (b) b.click(); }
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'mfaCode') { const b = $('#mfaGo'); if (b) b.click(); }
  });
  net.onAuth(() => { if (!net.signedIn()) paint(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && net.signedIn() && S.data && Date.now() - S.data.at > 120000 && !S.loading) load(); });
  window.addEventListener('online', () => { if (net.signedIn() && S.offlineAt) load(); });

  /* back from Google in the browser: the answer is in the address (?code=&pl_state=); only used if it matches what this tab sent */
  async function webReturn() {
    let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const code = q.get('code'), st = q.get('pl_state'), err = q.get('error_description') || q.get('error');
    if (!(st && (code || err))) return;
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem(K.oauth) || 'null'); sessionStorage.removeItem(K.oauth); } catch (e) { }
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { }
    if (!saved || saved.state !== st) return;
    if (err && !code) { S.msg = 'Google sign-in did not finish: ' + err; S.tone = 'bad'; return; }
    try { await net.oauthExchange(code, saved.verifier); } catch (e) { S.msg = 'Google sign-in failed: ' + nice(e); S.tone = 'bad'; }
  }

  /* the link in a confirmation or password-reset e-mail: the sign-in arrives after a "#". The token is checked with the service before it is used,
     and the address bar is cleared at once so the token is not left in the history. */
  async function hashReturn() {
    const info = net.parseHash(location.hash); if (!info) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    if (info.error) { S.msg = /expired|invalid|otp/i.test(info.error + ' ' + info.code) ? 'This link has expired or was already used. Please ask for a new one.' : 'This link did not work: ' + info.error; S.tone = 'bad'; return; }
    try {
      await net.adoptTokens(info);
      if (info.type === 'recovery') { S.recovery = true; S.msg = ''; }
      else { S.msg = 'Your email is confirmed. Welcome!'; S.tone = 'ok'; }
    } catch (e) { S.msg = 'This link did not work. Please ask for a new one.'; S.tone = 'bad'; }
  }

  (async () => {
    await hashReturn();
    await webReturn();
    if (net.signedIn()) await settle();                     // find out whether the account has an authenticator before anything is shown or loaded
    paint();
    if (net.signedIn() && net.mfaOk() && !S.recovery) load();
  })();
})();
