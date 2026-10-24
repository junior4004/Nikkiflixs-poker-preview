/* NIKKIFLIXS LOGIN GATE — Build 272 (Jerry's order 2026-10-24).
   Nobody gets into anything without passing it, in this order:
   18-or-older warning → username + password (NO complexity rules — the
   server only requires 6+ characters, and that is all we ask) →
   location ON (hard block until granted; no VPN check is possible from
   the browser, so none is claimed) → avatar pick (chosen + stuck) → in.
   Shared module: included by index.html and both Hold'em table files.
   State keys (all localStorage): nikkiflixs_age_ok ('1'),
   nikkiflixs_session + nikkiflixs_account (existing account keys),
   nikkiflixs_location_ok (ms timestamp, re-asked after 24h),
   nikkiflixs_avatar (existing picker key), nikkiflixs_gate_done ('1').
   Steps are checked independently: a returner missing only one step sees
   only that step. No dependencies on table internals — on table pages the
   gate talks to the live wire only through window.__NIKKIFLIXS_START_LIVE__
   and updates the hero portrait through the DOM. */
(function () {
  'use strict';
  if (window.__NIKKIFLIXS_GATE_LOADED__) return;
  window.__NIKKIFLIXS_GATE_LOADED__ = true;

  var API_BASE = 'https://nikkiflixs-poker-server.onrender.com';
  var AGE_KEY = 'nikkiflixs_age_ok';
  var SESSION_KEY = 'nikkiflixs_session';
  var ACCOUNT_KEY = 'nikkiflixs_account';
  var LOC_KEY = 'nikkiflixs_location_ok';
  var AVATAR_KEY = 'nikkiflixs_avatar';
  var DONE_KEY = 'nikkiflixs_gate_done';
  var LOC_TTL = 24 * 60 * 60 * 1000;
  var AVATAR_RE = /^\/assets\/avatars\/gallery\/avatar-(0[1-9]|1[0-9]|2[0-4])\.png$/;

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function avatarPathFor(n) { return '/assets/avatars/gallery/avatar-' + (n < 10 ? '0' : '') + n + '.png'; }
  function avatarKeyForPath(p) { var m = String(p || '').match(/avatar-(\d+)\.png$/); return m ? 'avatar-' + Number(m[1]) : ''; }

  function missingSteps() {
    var steps = [];
    if (lsGet(AGE_KEY) !== '1') steps.push('age');
    if (!lsGet(SESSION_KEY)) steps.push('login');
    var loc = Number(lsGet(LOC_KEY) || 0);
    if (!loc || (Date.now() - loc) > LOC_TTL) steps.push('location');
    if (!AVATAR_RE.test(lsGet(AVATAR_KEY))) steps.push('avatar');
    return steps;
  }

  var pending = missingSteps();
  if (pending.length === 0) {
    lsSet(DONE_KEY, '1');
    window.__NIKKIFLIXS_GATE__ = { done: true, step: null };
    return;
  }

  var creatorLogin = false;
  var pickedAvatar = '';

  var style = document.createElement('style');
  style.textContent =
    '#nkGate{position:fixed;inset:0;z-index:99999;background:rgba(10,7,5,.97);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}' +
    '#nkGate .nk-panel{width:100%;max-width:420px;max-height:92dvh;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;background:linear-gradient(180deg,#241a12,#120d09);border:2px solid #d9b557;border-radius:14px;box-shadow:0 18px 50px #000;padding:20px;box-sizing:border-box;color:#f2e7c8;font-family:sans-serif}' +
    '#nkGate h2{margin:0 0 10px;font-size:21px;letter-spacing:.04em;color:#ffd968;text-align:center}' +
    '#nkGate p{margin:0 0 12px;font-size:15px;line-height:1.5;color:#e8ddc4}' +
    '#nkGate p.nk-small{font-size:13px;color:#c9b489}' +
    '#nkGate .nk-msg{min-height:22px;color:#ffd968;font-size:14px;margin:6px 0}' +
    '#nkGate input{width:100%;padding:12px;border-radius:9px;border:1px solid #7a5b1e;background:#171310;color:#fff;font-size:16px;margin-bottom:10px;box-sizing:border-box}' +
    '#nkGate button.nk-btn{display:block;width:100%;padding:14px 10px;margin-top:8px;border-radius:10px;border:1px solid #e2af4f;background:linear-gradient(180deg,#b8872d,#654216);color:#fff9df;font-size:17px;font-weight:800;letter-spacing:.03em;cursor:pointer}' +
    '#nkGate button.nk-btn:disabled{opacity:.45;cursor:default}' +
    '#nkGate button.nk-btn.nk-secondary{background:#2a2119;border-color:#7a5b1e}' +
    '#nkGate a.nk-leave{display:block;text-align:center;margin-top:14px;color:#f2c76f;font-size:14px}' +
    '#nkGate .nk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;overflow-y:auto;max-height:46dvh;max-height:46vh;padding:2px}' +
    '#nkGate .nk-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:3px solid transparent;cursor:pointer;background:#21151d}' +
    '#nkGate .nk-grid img.nk-picked{border-color:#ffd968;box-shadow:0 0 0 2px #ffd968,0 0 14px #ffd96888}';
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'nkGate';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Nikkiflixs entry gate');
  root.innerHTML = '<div class="nk-panel"><div id="nkGateBody"></div></div>';
  document.body.appendChild(root);
  var body = document.getElementById('nkGateBody');

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function finish() {
    lsSet(DONE_KEY, '1');
    window.__NIKKIFLIXS_GATE__ = { done: true, step: null };
    if (root.parentNode) root.parentNode.removeChild(root);
    try { if (typeof window.__NIKKIFLIXS_START_LIVE__ === 'function') window.__NIKKIFLIXS_START_LIVE__(); } catch (e) {}
    /* Creator role is applied by the table's own load path (it validates the
       token via /api/me at load). A creator who just signed in through the
       gate reloads once so that path runs with the fresh token; the gate
       flag makes the reload skip straight in. */
    if (creatorLogin) { try { location.reload(); } catch (e) {} }
  }

  function showStep(step) {
    window.__NIKKIFLIXS_GATE__ = { done: false, step: step };
    if (step === 'age') {
      body.innerHTML =
        '<h2>18 OR OLDER ONLY</h2>' +
        '<p>Nikkiflixs is a <strong>free-to-play social poker club</strong> for players <strong>18 and older</strong>. It is not a casino and no real-money gambling happens here.</p>' +
        '<p>Gold coins have no cash value. They cannot be cashed out, exchanged, or redeemed for money or prizes — ever.</p>' +
        '<button class="nk-btn" id="nkAgeYes" type="button">I AM 18 OR OLDER — ENTER</button>' +
        '<a class="nk-leave" href="/about.html">I am under 18 — take me to About</a>';
      document.getElementById('nkAgeYes').addEventListener('click', function () {
        lsSet(AGE_KEY, '1');
        nextStep();
      });
    } else if (step === 'login') {
      body.innerHTML =
        '<h2>YOUR ACCOUNT</h2>' +
        '<p>One account for everything — your coins, pops, dice and gifts follow <strong>you</strong>, not the phone. New here? Pick a username and a password and tap SIGN UP.</p>' +
        '<p class="nk-small">Any password you want — 6 or more characters, no other rules. If you make it too easy, that is your business.</p>' +
        '<input id="nkUser" type="text" placeholder="Username" autocapitalize="none" autocomplete="username">' +
        '<input id="nkPass" type="password" placeholder="Password" autocomplete="current-password">' +
        '<button class="nk-btn" id="nkSignup" type="button">SIGN UP</button>' +
        '<button class="nk-btn nk-secondary" id="nkLogin" type="button">LOG IN</button>' +
        '<div class="nk-msg" id="nkLoginMsg"></div>';
      var doAuth = function (mode) {
        var u = (document.getElementById('nkUser').value || '').trim();
        var p = document.getElementById('nkPass').value || '';
        var msg = document.getElementById('nkLoginMsg');
        if (!u || p.length < 6) { msg.textContent = 'Username + a password of 6 or more characters.'; return; }
        msg.textContent = 'Talking to the server…';
        fetch(API_BASE + '/api/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            if (!x.ok) { msg.textContent = (x.j && x.j.error) || 'Something went wrong.'; return; }
            lsSet(SESSION_KEY, x.j.token || '');
            lsSet(ACCOUNT_KEY, JSON.stringify({ username: x.j.username, role: x.j.role }));
            if (x.j.role === 'creator') creatorLogin = true;
            nextStep();
          })
          .catch(function () { msg.textContent = 'Could not reach the server — check your connection and try again.'; });
      };
      document.getElementById('nkSignup').addEventListener('click', function () { doAuth('signup'); });
      document.getElementById('nkLogin').addEventListener('click', function () { doAuth('login'); });
    } else if (step === 'location') {
      body.innerHTML =
        '<h2>LOCATION MUST BE ON</h2>' +
        '<p>To enter, your location must be turned on. No VPNs, no workarounds. This protects the tables — if something goes wrong, we know where the person is.</p>' +
        '<p class="nk-small">Your phone will ask permission. Tap Allow. Your exact spot is only used to confirm you are really where you say you are.</p>' +
        '<button class="nk-btn" id="nkLocBtn" type="button">ALLOW LOCATION</button>' +
        '<div class="nk-msg" id="nkLocMsg"></div>';
      var askLoc = function () {
        var msg = document.getElementById('nkLocMsg');
        if (!navigator.geolocation) {
          msg.textContent = 'This browser cannot share location. Open nikkiflixs.com in your phone browser with location turned on.';
          return;
        }
        msg.textContent = 'Waiting for your phone…';
        navigator.geolocation.getCurrentPosition(function () {
          lsSet(LOC_KEY, String(Date.now()));
          nextStep();
        }, function (err) {
          var denied = err && err.code === 1;
          msg.textContent = denied
            ? 'Location is blocked for this site. Allow Location for nikkiflixs.com in your browser or phone settings, then tap Try Again.'
            : 'Could not get your location. Make sure location is on, then tap Try Again.';
          var btn = document.getElementById('nkLocBtn');
          if (btn) btn.textContent = 'TRY AGAIN';
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
      };
      document.getElementById('nkLocBtn').addEventListener('click', askLoc);
    } else if (step === 'avatar') {
      var stored = AVATAR_RE.test(lsGet(AVATAR_KEY)) ? lsGet(AVATAR_KEY) : '';
      pickedAvatar = stored;
      body.innerHTML =
        '<h2>PICK YOUR AVATAR</h2>' +
        '<p>Choose who sits at the table as you. This one <strong>sticks</strong> — it will not change on its own. You can still change it later from your profile.</p>' +
        '<div class="nk-grid" id="nkAvatarGrid"></div>' +
        '<button class="nk-btn" id="nkAvatarGo" type="button">' + (stored ? 'KEEP THIS AVATAR' : 'ENTER WITH THIS AVATAR') + '</button>';
      var grid = document.getElementById('nkAvatarGrid');
      var goBtn = document.getElementById('nkAvatarGo');
      var mark = function () {
        var imgs = grid.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) imgs[i].classList.toggle('nk-picked', imgs[i].getAttribute('data-avatar') === pickedAvatar);
        goBtn.disabled = !pickedAvatar;
        goBtn.textContent = (stored && pickedAvatar === stored) ? 'KEEP THIS AVATAR' : 'ENTER WITH THIS AVATAR';
      };
      for (var n = 1; n <= 24; n++) {
        (function (path) {
          var im = document.createElement('img');
          im.src = path;
          im.alt = 'Avatar';
          im.setAttribute('data-avatar', path);
          im.addEventListener('click', function () { pickedAvatar = path; mark(); });
          grid.appendChild(im);
        })(avatarPathFor(n));
      }
      mark();
      goBtn.addEventListener('click', function () {
        if (!pickedAvatar) return;
        lsSet(AVATAR_KEY, pickedAvatar);
        window.__NIKKIFLIXS_AVATAR_KEY__ = avatarKeyForPath(pickedAvatar);
        /* On table pages, move the hero portrait at once (the table's own
           load path already applied the old stored avatar, if any). */
        try {
          var hero = document.querySelector('.seat.you .portrait');
          if (hero) hero.src = pickedAvatar;
        } catch (e) {}
        finish();
      });
    }
  }

  function nextStep() {
    var rest = missingSteps();
    if (rest.length === 0) { finish(); return; }
    showStep(rest[0]);
  }

  showStep(pending[0]);
})();
