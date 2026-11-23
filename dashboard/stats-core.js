/* Piano Logger Cloud Dashboard: the statistics, as pure functions (no page, no network), so tests can check them.
   The rules are the Piano Logger app's own rules, ported exactly:
   - a day with at least one key press is a "practice day"
   - a streak is a run of practice days in a row; the CURRENT streak may still include yesterday if today has no press yet (app function `streaks`)
   - weeks run Monday to Sunday (the app's weekly numbers use the same start)
   - every day is the local day written by the computer that logged it (the cloud keeps that text, so nothing is moved to another day)
   Tests: tests/v920/dashboard.parity.test.js compares these functions with the app's own code. */
const PLStats = (() => {
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  // the day `i` days before `today` ('YYYY-MM-DD'), by calendar
  const dayBefore = (today, i) => { const t = parse(today); t.setDate(t.getDate() - i); return fmt(t); };
  const mondayOf = day => { const t = parse(day); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return fmt(t); };

  // rows of daily_stats from every device -> one entry per day (devices add up)
  function mergeDaily(daily) {
    const m = {};
    for (const r of daily || []) {
      const d = m[r.day] || (m[r.day] = { day: r.day, presses: 0, active_ms: 0, hours: Array(24).fill(0), devices: {} });
      d.presses += r.presses; d.active_ms += r.active_ms;
      (r.hours || []).forEach((v, i) => { d.hours[i] += v; });
      d.devices[r.device_id] = (d.devices[r.device_id] || 0) + r.presses;
    }
    return m;
  }
  // the app's own `streaks`, with "today" given instead of read from the clock
  function streaks(days, today) {
    const ds = Object.keys(days).filter(k => days[k] > 0).sort(); let best = 0, run = 0, prev = null;
    ds.forEach(k => { const t = Date.parse(k + 'T00:00:00Z'); run = prev != null && t - prev === 864e5 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    let cur = 0; for (let i = days[dayBefore(today, 0)] ? 0 : 1; days[dayBefore(today, i)]; i++) cur++;
    return { best, cur };
  }
  const sumRange = (byDay, from, to, key) => { let s = 0; for (const k in byDay) if (k >= from && k <= to) s += byDay[k][key]; return s; };
  const countRange = (byDay, from, to) => { let s = 0; for (const k in byDay) if (k >= from && k <= to && byDay[k].presses > 0) s++; return s; };

  function summarize(byDay, today) {
    const counts = {}; for (const k in byDay) counts[k] = byDay[k].presses;
    const wk = mondayOf(today), mo = today.slice(0, 7) + '-01', yr = today.slice(0, 4) + '-01-01';
    const range = (from) => ({ presses: sumRange(byDay, from, today, 'presses'), ms: sumRange(byDay, from, today, 'active_ms'), days: countRange(byDay, from, today) });
    const all = range('0000-01-01'), hours = Array(24).fill(0);
    let best = null; for (const k in byDay) { for (let i = 0; i < 24; i++) hours[i] += byDay[k].hours[i]; if (byDay[k].presses > 0 && (!best || byDay[k].presses > best.presses)) best = { day: k, presses: byDay[k].presses }; }
    return {
      total: all, today: range(today), week: range(wk), month: range(mo), year: range(yr),
      last7: range(dayBefore(today, 6)), last30: range(dayBefore(today, 29)),
      streak: streaks(counts, today), hours, bestDay: best,
      avgPerPlayedDay: all.days ? Math.round(all.presses / all.days) : 0
    };
  }
  // the last n days, oldest first: [{day, value}] for the chart. metric: 'presses' | 'ms'
  function series(byDay, today, n, metric) {
    const out = [], key = metric === 'ms' ? 'active_ms' : 'presses';
    for (let i = n - 1; i >= 0; i--) { const d = dayBefore(today, i); out.push({ day: d, value: byDay[d] ? byDay[d][key] : 0 }); }
    return out;
  }
  // for a calendar heat map: `weeks` columns of 7 days (Monday first), the last column ends with this week
  function heat(byDay, today, weeks) {
    const start = dayBefore(mondayOf(today), (weeks - 1) * 7), cols = []; let max = 0;
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const day = (() => { const t = parse(start); t.setDate(t.getDate() + w * 7 + d); return fmt(t); })();
        const v = day > today ? null : (byDay[day] ? byDay[day].presses : 0); if (v > max) max = v; col.push({ day, value: v });
      }
      cols.push(col);
    }
    return { cols, max };
  }
  const level = (v, max) => !v ? 0 : max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(v / max * 4)));
  function sessionStats(sessions) {
    let n = 0, ms = 0, longest = 0, presses = 0;
    for (const s of sessions || []) { n++; const d = Math.max(0, s.end_ts - s.start_ts); ms += d; if (d > longest) longest = d; presses += s.presses; }
    return { count: n, totalMs: ms, avgMs: n ? Math.round(ms / n) : 0, longestMs: longest, presses };
  }
  const hm = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };
  const num = n => Math.round(n).toLocaleString('en-US');
  return { dayBefore, mondayOf, mergeDaily, streaks, summarize, series, heat, level, sessionStats, hm, num };
})();
if (typeof module !== 'undefined') module.exports = PLStats;
