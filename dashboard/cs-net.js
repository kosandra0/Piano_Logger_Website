      /* =====================================================================
         v9.2.0 — CLOUD SYNC NETWORK CLIENT: plain fetch to Supabase Auth, the database functions and file storage.
         No library. Only the refresh token is kept (in the storage object you pass in); the short-lived access token
         stays in memory. The key used here is the project's PUBLIC (publishable) key; the database rules protect the data.
         Source of truth: tools/v920/cs-net.js (spliced into the page by tools/v920/splice.js).
         ===================================================================== */
      const CSN = (() => {
        class CSNError extends Error { constructor(msg, o) { super(msg); Object.assign(this, o || {}); this.name = 'CSNError'; } }
        const b64u = bytes => btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
        const jwtClaims = t => { try { return JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) || {}; } catch (e) { return {}; } };
        const jwtExp = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return 0; } };
        // the verified authenticator-app (TOTP) factors in a user record: [{id,name}], or null when the record does not say (unknown, never "none")
        const factorsOf = u => Array.isArray(u && u.factors) ? u.factors.filter(f => f && f.factor_type === 'totp' && f.status === 'verified').map(f => ({ id: f.id, name: f.friendly_name || 'Authenticator app' })) : null;

        // cfg: { url, key, fetch?, store?: {get(), set(v), clear()}, now?, timeoutMs? }
        function create(cfg) {
          const base = cfg.url.replace(/\/+$/, ''), now = cfg.now || (() => Date.now());
          const doFetch = cfg.fetch || ((...a) => globalThis.fetch(...a));
          const timeoutMs = cfg.timeoutMs || 30000;
          let saved = null; try { saved = cfg.store ? cfg.store.get() : null; } catch (e) { saved = null; }
          // factors: the verified authenticator factors last seen (a hint kept so an offline start knows two-step sign-in applies; not secret). null = not known yet.
          // aal: the assurance level of the CURRENT access token ('aal2' only after the authenticator code was checked); unknown after a restart until the token is refreshed.
          let sess = saved && saved.refresh_token ? { refresh_token: saved.refresh_token, user: saved.user || null, access_token: null, exp: 0, aal: 'aal1', factors: Array.isArray(saved.factors) ? saved.factors : null } : null;
          let refreshing = null; const listeners = [];
          const emit = () => listeners.forEach(f => { try { f(api.user()); } catch (e) { } });
          const persist = () => { try { if (!cfg.store) return; if (sess) cfg.store.set({ refresh_token: sess.refresh_token, user: sess.user, factors: sess.factors }); else cfg.store.clear(); } catch (e) { } };

          async function request(path, o = {}) {
            const h = Object.assign({ apikey: cfg.key }, o.headers || {});
            if (o.token) h.Authorization = 'Bearer ' + o.token;     // no token: only the apikey header (a publishable key is not a JWT)
            let body = o.body;
            if (body !== undefined && !o.raw) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
            // A hard time limit that does not depend on the abort signal: a stalled connection must never leave the person (or the sync engine) waiting for ever.
            const lim = (o.timeout || timeoutMs) + 1500;
            const limited = p => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), lim); })]).finally(() => clearTimeout(t)); };
            const offline = e => new CSNError('No connection to the cloud (' + (e && e.name || 'error') + ')', Object.assign({ status: 0, cause: e }, CSC.classify(0, true)));
            let res;
            try {
              res = await limited(doFetch(base + path, { method: o.method || 'GET', headers: h, body, signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(o.timeout || timeoutMs) : undefined }));
            } catch (e) {
              throw offline(e);
            }
            let text = '';
            try { if (o.binary && res.ok) return { status: res.status, data: await limited(res.arrayBuffer()) }; text = await limited(res.text()); } catch (e) { throw offline(e); }
            let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
            if (!res.ok) {
              const c = CSC.classify(res.status, false, res.headers && res.headers.get && res.headers.get('retry-after'));
              const msg = (json && (json.msg || json.message || json.error_description || json.error)) || ('HTTP ' + res.status);
              throw new CSNError(String(msg), Object.assign({ status: res.status, code: json && (json.code || json.error_code), body: json }, c));
            }
            return { status: res.status, data: json };
          }

          function setSession(j) {
            const same = sess && j.user && sess.user && sess.user.id === j.user.id;          // a different person: forget what we knew about the previous one
            const fx = j.user ? factorsOf(j.user) : null;
            sess = { refresh_token: j.refresh_token, user: j.user ? { id: j.user.id, email: j.user.email } : (sess && sess.user), access_token: j.access_token, exp: j.expires_at ? j.expires_at * 1000 : jwtExp(j.access_token),
              aal: jwtClaims(j.access_token).aal === 'aal2' ? 'aal2' : 'aal1', factors: fx !== null ? fx : (same || !j.user ? (sess && sess.factors) || null : null) };
            persist(); emit();
          }
          const dropSession = () => { sess = null; persist(); emit(); };

          async function refresh() {
            if (!sess || !sess.refresh_token) throw new CSNError('Not signed in', { kind: 'auth', status: 401 });
            if (refreshing) return refreshing;                       // refresh tokens rotate: only ONE refresh at a time
            refreshing = (async () => {
              try {
                const r = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sess.refresh_token } });
                setSession(r.data);
              } catch (e) {
                if (e.status === 400 || e.status === 401 || e.status === 403) { dropSession(); e.kind = 'auth'; e.retry = false; }
                throw e;
              } finally { refreshing = null; }
            })();
            return refreshing;
          }
          async function token() {
            if (!sess) throw new CSNError('Not signed in', { kind: 'auth', status: 401 });
            if (!sess.access_token || sess.exp - now() < 60000) await refresh();
            return sess.access_token;
          }
          // Two-step sign-in gate. Every call that reads or writes the person's data (and the password change) goes through authed(), and is REFUSED here
          // unless the account has no authenticator, or this session has completed the authenticator-code check (assurance level 2). If we do not know yet whether
          // the account has an authenticator, we ask first. Only the calls that perform the check itself pass allowAal1. (The database enforces the same rule.)
          const mfaBlock = () => new CSNError('Enter the code from your authenticator app to continue.', { kind: 'mfa', mfa: true, retry: false, status: 401 });
          async function authed(path, o = {}) {
            if (!o.allowAal1) {
              if (sess && !sess.access_token) await token();                       // after a restart the level is only known once the token was refreshed (a refresh keeps level 2)
              if (sess && sess.factors === null) await api.mfaStatus();
              if (sess && !api.mfaState().ok) throw mfaBlock();
            }
            const t = await token();
            try { return await request(path, Object.assign({}, o, { token: t })); }
            catch (e) {
              if (e.status === 401 && sess) { await refresh(); return request(path, Object.assign({}, o, { token: sess.access_token })); }
              throw e;
            }
          }

          const api = {
            CSNError,
            user: () => sess && sess.user ? { id: sess.user.id, email: sess.user.email } : null,
            signedIn: () => !!sess,
            onAuth: fn => { listeners.push(fn); },
            // redirectTo: where the confirmation e-mail's link should lead (it must be in the project's list of allowed addresses)
            async signUp(email, password, redirectTo) {
              const r = await request('/auth/v1/signup' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), { method: 'POST', body: { email, password } });
              if (r.data && r.data.access_token) { setSession(r.data); return { needsConfirm: false }; }
              return { needsConfirm: true };
            },
            async signIn(email, password) {
              const r = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
              setSession(r.data); return api.user();
            },
            /* The links in confirmation and password-reset e-mails open the page with the sign-in in the address after a "#":
               #access_token=...&refresh_token=...&expires_in=3600&type=recovery   (or type=signup)
               or an error: #error=access_denied&error_code=otp_expired&error_description=...
               parseHash reads it; adoptTokens checks the token with the service (never trusts the address) and signs in. */
            parseHash(hash) {
              const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
              if (q.get('error') || q.get('error_code')) return { error: q.get('error_description') || q.get('error') || 'This link did not work', code: q.get('error_code') || '' };
              if (q.get('access_token') && q.get('refresh_token')) return { access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: +q.get('expires_in') || 3600, type: q.get('type') || '' };
              return null;
            },
            async adoptTokens(t) {
              const r = await request('/auth/v1/user', { token: t.access_token });                 // a made-up or expired token fails here
              if (!r.data || !r.data.id) throw new CSNError('This link did not work', { kind: 'auth', status: 401 });
              setSession({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Math.floor(now() / 1000) + (t.expires_in || 3600), user: { id: r.data.id, email: r.data.email } });
              return api.user();
            },
            async updatePassword(newPassword) { await authed('/auth/v1/user', { method: 'PUT', body: { password: newPassword } }); },      // gated: with an authenticator on the account this needs the code first

            /* ---- two-step sign-in with an authenticator app (TOTP). The code is only ever passed to the service; it is not stored or logged. ---- */
            // what we know: { signedIn, known (do we know if there is an authenticator), required (there is one), level ('aal1'|'aal2'), levelKnown, pending (a code must be typed), ok (data may be used), factors:[{id,name}] }
            mfaState() {
              // levelKnown: false right after a restart (no access token yet): the level is learned when the token is refreshed, so it is neither "ok" nor "code needed" until then
              const f = sess ? sess.factors : null, known = Array.isArray(f), required = known && f.length > 0, levelKnown = !!(sess && sess.access_token), level = sess && sess.aal === 'aal2' ? 'aal2' : 'aal1';
              return { signedIn: !!sess, known, required, level, levelKnown, pending: known && required && levelKnown && level !== 'aal2', ok: !!sess && known && (!required || (levelKnown && level === 'aal2')), factors: known ? f.map(x => ({ id: x.id, name: x.name })) : [] };
            },
            mfaOk: () => api.mfaState().ok,
            // ask the service which authenticators the account has (works at level 1: it is needed to know whether a code is required)
            async mfaStatus() {
              const r = await authed('/auth/v1/user', { allowAal1: true, timeout: 15000 });          // short: the person is waiting on this and the UI retries by itself
              const fx = factorsOf(r.data);
              if (sess) { sess.factors = fx === null ? [] : fx; persist(); emit(); }      // the service leaves "factors" out when there are none
              return api.mfaState();
            },
            // check the 6-digit code: the answer is a NEW session at level 2 (its refresh token keeps level 2)
            async mfaVerify(factorId, code) {
              const c = String(code == null ? '' : code).replace(/\s+/g, '');
              if (!/^\d{6}$/.test(c)) throw new CSNError('Please type the 6 digits shown in your authenticator app.', { kind: 'client', code: 'mfa_code_format', retry: false });
              if (!sess) throw new CSNError('Not signed in', { kind: 'auth', status: 401 });
              const fid = encodeURIComponent(factorId);
              const ch = await authed('/auth/v1/factors/' + fid + '/challenge', { method: 'POST', body: {}, allowAal1: true });
              let v;
              try { v = await authed('/auth/v1/factors/' + fid + '/verify', { method: 'POST', body: { challenge_id: ch.data.id, code: c }, allowAal1: true }); }
              catch (e) {
                if (e.status === 400 || e.status === 422) { const w = new CSNError('That code did not work. Use the newest code in your authenticator app (it changes every 30 seconds) and try again.', { kind: 'client', code: 'mfa_code_wrong', status: e.status, retry: false }); throw w; }
                throw e;
              }
              setSession(v.data);
              await api.mfaStatus();
              return api.mfaState();
            },
            // add an authenticator: returns what to show the person ONCE (QR picture and the typed key); activate it with mfaVerify(id, code). Never log or keep the secret.
            async mfaEnroll(friendlyName) {
              const r = await authed('/auth/v1/factors', { method: 'POST', body: { factor_type: 'totp', friendly_name: String(friendlyName || 'Piano Logger').slice(0, 60), issuer: 'Piano Logger' }, allowAal1: true });
              const t = (r.data && r.data.totp) || {};
              return { id: r.data && r.data.id, qr: t.qr_code || '', secret: t.secret || '', uri: t.uri || '' };
            },
            // remove an authenticator that was never activated (cancel while adding one): allowed at level 1
            async mfaCancelEnroll(factorId) { await authed('/auth/v1/factors/' + encodeURIComponent(factorId), { method: 'DELETE', allowAal1: true }); },
            // remove an ACTIVE authenticator: only with a level-2 session (the code was checked in this session); the caller must have asked the person to confirm
            async mfaRemove(factorId) { await authed('/auth/v1/factors/' + encodeURIComponent(factorId), { method: 'DELETE' }); await api.mfaStatus(); },
            async recover(email, redirectTo) { await request('/auth/v1/recover' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), { method: 'POST', body: { email } }); },
            async signOut(scope) {                                    // scope: 'local' (this device), 'global' (every device)
              try { if (sess && sess.access_token) await request('/auth/v1/logout?scope=' + (scope || 'local'), { method: 'POST', token: sess.access_token }); } catch (e) { /* signing out must always work locally */ }
              dropSession();
            },
            refresh,
            /* Google (or any provider) with PKCE: open the returned url in a browser, then call oauthExchange with the code from the redirect */
            async oauthStart(provider, redirectTo) {
              const verifier = b64u(rand(48)), state = b64u(rand(16));
              const ch = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
              const rt = redirectTo + (redirectTo.indexOf('?') < 0 ? '?' : '&') + 'pl_state=' + state;
              const url = base + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) + '&redirect_to=' + encodeURIComponent(rt) + '&code_challenge=' + ch + '&code_challenge_method=s256&flow_type=pkce';
              return { url, verifier, state };
            },
            async oauthExchange(code, verifier) {
              const r = await request('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: verifier } });
              setSession(r.data); return api.user();
            },
            rpc: async (name, args) => (await authed('/rest/v1/rpc/' + name, { method: 'POST', body: args || {} })).data,
            select: async (table, query) => (await authed('/rest/v1/' + table + (query ? '?' + query : ''))).data,
            /* storage (private bucket press-chunks; the database rules allow only the user's own folder) */
            async upload(path, bytes) { return authed('/storage/v1/object/press-chunks/' + path, { method: 'POST', body: bytes, raw: true, headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' } }); },
            async download(path) { return (await authed('/storage/v1/object/authenticated/press-chunks/' + path, { binary: true })).data; },
            async removeObject(path) { return authed('/storage/v1/object/press-chunks/' + path, { method: 'DELETE' }); },
            async removeObjects(paths) { if (!paths.length) return null; return authed('/storage/v1/object/press-chunks', { method: 'DELETE', body: { prefixes: paths } }); },
            // everything in one folder (entries with id null are sub-folders)
            async listObjects(prefix) {
              const out = [];
              for (let off = 0; ; off += 1000) {
                const r = await authed('/storage/v1/object/list/press-chunks', { method: 'POST', body: { prefix, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } } });
                const a = Array.isArray(r.data) ? r.data : []; out.push(...a); if (a.length < 1000) break;
              }
              return out;
            },
            // all rows of a table (the service returns at most 1000 at a time)
            async selectAll(table, query) {
              const out = [];
              for (let off = 0; ; off += 1000) { const a = await api.select(table, (query ? query + '&' : '') + 'limit=1000&offset=' + off); out.push(...a); if (a.length < 1000) break; }
              return out;
            },
            async deleteAccount() { const r = await authed('/functions/v1/delete-account', { method: 'POST', body: { confirm: 'DELETE MY ACCOUNT' } }); dropSession(); return r.data; },
            now: async () => Number(await api.rpc('sync_now', {}))
          };
          return api;
        }
        return { create, CSNError };
      })();
