      /* =====================================================================
         v9.2.0 — CLOUD SYNC CORE (no DOM, no network): day summaries, sessions, content signatures, versions,
         retry back-off, error classes and the sync status model. Pure functions only, so tests can run them in Node.
         Source of truth: tools/v920/cs-core.js (spliced into the page by tools/v920/splice.js).
         ===================================================================== */
      const CSC = (() => {
        const GAP_SESSION = 300000, GAP_PLAY = 2000;            // same rules as the app's own session/active-time logic (pfFeed)
        const BATCH = 500;                                       // rows per request (the server accepts 1 to 500)

        /* ---------- one local day of presses -> cloud rows ---------- */
        // rows: presses of ONE local day (any order). A session never crosses midnight: the cloud keeps one session per local day.
        function summarizeDay(day, rows, tz) {
          const r = rows.slice().sort((a, b) => a.startTs - b.startTs || a.midi - b.midi);
          const hours = Array(24).fill(0);
          let velSum = 0, durSum = 0, maxPoly = 0, first = 0, last = 0, active = 0;
          const sessions = []; let cur = null, prevT = null;
          for (const p of r) {
            const t = +p.startTs; if (!Number.isFinite(t)) continue;
            const h = Math.min(23, Math.max(0, p.hour | 0)); hours[h]++;
            velSum += +p.velocity || 0; durSum += Math.round(+p.durationMs || 0); maxPoly = Math.max(maxPoly, p.simultaneous | 0);
            if (!first || t < first) first = t; if (t > last) last = t;
            if (prevT === null || t - prevT > GAP_SESSION) {
              cur = { start_ts: t, end_ts: t, presses: 0, active_ms: 0, day, tz: tz || null }; sessions.push(cur);
            } else if (t - prevT <= GAP_PLAY) { cur.active_ms += t - prevT; active += t - prevT; }
            cur.presses++; cur.end_ts = t; prevT = t;
          }
          return {
            daily: { day, presses: sessions.reduce((s, x) => s + x.presses, 0), active_ms: active, hours, vel_sum: velSum, dur_sum_ms: durSum, max_poly: maxPoly, first_ts: first || null, last_ts: last || null },
            sessions
          };
        }

        /* ---------- content signature: same content -> same text, so unchanged days are never uploaded again ---------- */
        function canonical(sum) {
          const d = sum.daily;
          return JSON.stringify([d.day, d.presses, d.active_ms, d.hours.join(','), d.vel_sum, d.dur_sum_ms, d.max_poly, d.first_ts, d.last_ts,
            sum.sessions.map(s => [s.start_ts, s.end_ts, s.presses, s.active_ms])]);
        }
        function fnvHex(str) {                                    // fallback only (no crypto.subtle): two 32-bit FNV-1a passes
          let a = 0x811c9dc5, b = 0x01000193 ^ 0x9747b28c;
          for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a ^= c; a = Math.imul(a, 16777619) >>> 0; b ^= c + i; b = Math.imul(b, 2246822519) >>> 0; }
          return 'f1-' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
        }
        async function sha256Hex(str) {
          const s = globalThis.crypto && globalThis.crypto.subtle;
          if (!s) return fnvHex(str);
          const buf = await s.digest('SHA-256', new TextEncoder().encode(str));
          return 's2-' + Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
        }
        const signature = async sum => sha256Hex(canonical(sum));

        /* ---------- versions: a row only changes on the server when the incoming version is HIGHER ---------- */
        // skew = server clock minus this device's clock (ms). The version is the corrected device time, never lower than prev+1.
        const nextVersion = (prev, nowMs, skew) => Math.max((prev || 0) + 1, Math.round(nowMs + (skew || 0)));

        /* ---------- batching, back-off, errors ---------- */
        function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
        // equal jitter: between half and the full delay; 5 s, 10 s, 20 s ... capped at 15 minutes
        const backoffMs = (attempt, rnd) => { const base = Math.min(900000, 5000 * Math.pow(2, Math.max(0, attempt - 1))); return Math.round(base / 2 + (rnd == null ? Math.random() : rnd) * base / 2); };
        // kinds: offline (no connection) · auth (sign in again) · rate (slow down) · server (try again later) · client (our data was refused: do not retry blindly)
        function classify(status, networkFailed, retryAfterHeader) {
          if (networkFailed) return { kind: 'offline', retry: true };
          if (status === 401) return { kind: 'auth', retry: false };
          if (status === 403) return { kind: 'client', retry: false };
          if (status === 429) { const s = parseFloat(retryAfterHeader); return { kind: 'rate', retry: true, retryAfterMs: Number.isFinite(s) ? Math.min(900000, Math.max(1000, s * 1000)) : 30000 }; }
          if (status >= 500 || status === 408 || status === 0) return { kind: 'server', retry: true };
          return { kind: 'client', retry: false };
        }

        /* ---------- status model: what the small chip and the Account page say ---------- */
        // in: { enabled, signedIn, appOk, online, syncing, pending, failed, authRequired, mfaRequired, uploading:{done,total}|null, lastOkAt }
        function statusOf(s) {
          if (!s.enabled) return { code: 'off', text: 'Cloud sync is off', tone: 'muted' };
          if (!s.appOk) return { code: 'update', text: 'Update the app to use cloud sync', tone: 'warn' };
          if (!s.signedIn || s.authRequired) return { code: 'auth', text: 'Sign in to sync', tone: 'warn' };
          if (s.mfaRequired) return { code: 'mfa', text: 'Enter your authenticator code to sync', tone: 'warn' };      // two-step sign-in not finished: nothing is uploaded
          if (s.syncing) return s.uploading && s.uploading.total ? { code: 'syncing', text: 'Uploading history: ' + s.uploading.done + ' of ' + s.uploading.total + ' days', tone: 'busy' } : { code: 'syncing', text: 'Syncing…', tone: 'busy' };
          if (!s.online) return { code: 'offline', text: s.pending ? 'Offline: ' + s.pending + ' day' + (s.pending === 1 ? '' : 's') + ' waiting' : 'Offline', tone: 'muted' };
          if (s.failed) return { code: 'failed', text: 'Sync failed, will retry', tone: 'bad' };
          if (s.pending) return { code: 'pending', text: s.pending + ' day' + (s.pending === 1 ? '' : 's') + ' waiting to sync', tone: 'busy' };
          if (s.uploading && s.uploading.total && s.uploading.done < s.uploading.total) return { code: 'pending', text: 'Uploading history: ' + s.uploading.done + ' of ' + s.uploading.total + ' days', tone: 'busy' };
          return s.lastOkAt ? { code: 'synced', text: 'Synced', tone: 'ok' } : { code: 'pending', text: 'Waiting for the first sync', tone: 'busy' };
        }

        /* ---------- last-writer-wins for small user settings (version = corrected time) ---------- */
        const pickNewer = (a, b) => !a ? b : !b ? a : (b.version > a.version ? b : a);

        /* ---------- small helpers ---------- */
        const dayOf = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '2020-01-01' && s <= '2100-01-01';
        const newDeviceId = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

        return { GAP_SESSION, GAP_PLAY, BATCH, summarizeDay, canonical, signature, sha256Hex, fnvHex, nextVersion, chunk, backoffMs, classify, statusOf, pickNewer, dayOf, validDay, newDeviceId };
      })();
