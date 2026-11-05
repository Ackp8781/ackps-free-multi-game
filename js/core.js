// Site shell: code gate, accounts, game hub, and the helpers every game mounts with.
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') n.className = props[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
    else if (k in n) n[k] = props[k];
    else n.setAttribute(k, props[k]);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const rng = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => {
  if (n < 1e4) return String(Math.floor(n));
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(2) + u[i];
};
const Store = {
  get(k, d) { try { const v = localStorage.getItem('amg.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('amg.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('amg.' + k); } catch (e) {} },
};
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const loadThree = () => window.THREE ? Promise.resolve() : new Promise((ok, no) => {
  const spin = el('div', { class: 'loader', role: 'status' }, el('i'), 'Loading 3D…');
  document.body.append(spin);
  const s = el('script', { src: THREE_URL, onload: () => { spin.remove(); ok(); }, onerror: () => { spin.remove(); no(new Error('Could not load the 3D engine.')); } });
  document.head.append(s);
});

const App = (() => {
  // SHA-256 of the entry code, so the code is not sitting in the public source as plain text.
  const GATE = 'c49eb5e7bb09a8e471441ed78fa006cbb96c24b221b12523d8ac63ecef1d81b0';
  const games = [];
  const root = () => document.getElementById('app');
  let user = null, active = null;

  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const hashPw = async (pw, salt) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, key, 256));
  };
  const unlocked = () => { try { return sessionStorage.getItem('amg.gate') === '1'; } catch (e) { return false; } };

  function toast(text) {
    const t = el('div', { class: 'toast', role: 'status', onanimationend: () => t.remove() }, text);
    document.body.append(t);
  }
  // Slow drifting stars behind the menus. Paused during games to leave them the frame budget.
  function backdrop() {
    const c = el('canvas', { class: 'stars', 'aria-hidden': 'true' }), g = c.getContext('2d');
    document.body.prepend(c);
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), r: .5 + Math.random() * 1.6, s: .004 + Math.random() * .012, p: Math.random() * 6 }));
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = now => {
      if (!location.hash.startsWith('#/play/') || calm) {
        g.clearRect(0, 0, c.width, c.height);
        for (const s of stars) {
          const y = ((s.y - (calm ? 0 : now * .00001 * s.s * 100)) % 1 + 1) % 1;
          g.globalAlpha = .35 + .5 * Math.abs(Math.sin(now * .001 + s.p));
          g.fillStyle = '#fff'; g.beginPath(); g.arc(s.x * c.width, y * c.height, s.r, 0, 7); g.fill();
        }
      }
      if (!calm) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function show(...nodes) { root().replaceChildren(...nodes); }

  function gate() {
    const input = el('input', { class: 'code', type: 'password', inputMode: 'numeric', maxLength: 8, autocomplete: 'off', 'aria-label': 'Entry code', placeholder: '····' });
    const err = el('p', { class: 'err', role: 'alert' });
    show(el('div', { class: 'center' }, el('div', { class: 'box' },
      el('div', { class: 'logo' }, "Ackp's Free Multi Game"),
      el('p', { class: 'note' }, 'Enter the code to come in.'),
      el('form', { onsubmit: async e => {
        e.preventDefault();
        if (await sha(input.value) === GATE) {
          try { sessionStorage.setItem('amg.gate', '1'); } catch (x) {}
          Sfx.play('upgrade');
          route();
        } else { Sfx.play('hurt'); err.textContent = 'Wrong code.'; input.value = ''; input.focus(); const b = input.closest('.box'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
      } }, input, err,
        el('div', { class: 'keypad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(k => el('button', { type: 'button', class: k === '✓' ? 'go' : '', onclick: () => {
          if (k === '⌫') input.value = input.value.slice(0, -1);
          else if (k === '✓') input.form.requestSubmit();
          else if (input.value.length < 8) input.value += k;
        } }, k)))))));
    input.focus();
  }

  function auth(mode = 'login') {
    const name = el('input', { placeholder: 'Username', autocomplete: 'username', maxLength: 20, required: true, 'aria-label': 'Username' });
    const pw = el('input', { type: 'password', placeholder: 'Password', minLength: 6, required: true, 'aria-label': 'Password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    const err = el('p', { class: 'err', role: 'alert' });
    const go = el('button', { class: 'btn' }, mode === 'login' ? 'Log in' : 'Create account');
    const submit = async e => {
      e.preventDefault();
      const n = name.value.trim();
      if (!/^[\w .-]{2,20}$/.test(n)) { err.textContent = 'Use 2-20 letters, numbers, spaces, dots or dashes.'; return; }
      go.disabled = true; err.textContent = mode === 'login' ? 'Logging in…' : 'Creating account…';
      try {
        await Cloud.start();
        if (mode === 'signup') await Cloud.signUp(n, pw.value); else await Cloud.logIn(n, pw.value);
        route();
      } catch (x) { err.textContent = x.message; go.disabled = false; }
    };
    show(el('div', { class: 'center' }, el('div', { class: 'box' },
      el('div', { class: 'logo' }, "Ackp's Free Multi Game"),
      el('div', { class: 'tabs' },
        el('button', { class: 'btn' + (mode === 'login' ? '' : ' alt'), onclick: () => auth('login') }, 'Log in'),
        el('button', { class: 'btn' + (mode === 'signup' ? '' : ' alt'), onclick: () => auth('signup') }, 'Create account')),
      el('form', { onsubmit: submit }, name, pw, err, go),
      el('p', { class: 'note' }, mode === 'signup' ? 'Your account works on any device. Game saves stay in the browser you play on.' : 'Accounts made before the online update need to be created again.'))));
    name.focus();
  }

  // Friends: requests, who is online and what they play, invites to rooms.
  let social = null, socialOff = null, panelOpen = false;
  const badge = el('span', { class: 'badge' });
  const panel = el('aside', { class: 'friends', 'aria-label': 'Friends' });
  const seenInvites = new Set();
  const gameName = id => (games.find(x => x.id === id) || { name: id }).name;
  const joinRoom = (game, code) => {
    try { sessionStorage.setItem('amg.join', JSON.stringify({ game, code })); } catch (e) {}
    panelOpen = false; panel.classList.remove('open');
    if (location.hash === '#/play/' + game) route(); else location.hash = '#/play/' + game;
  };
  function watchSocial() {
    if (socialOff) socialOff();
    socialOff = Cloud.watch(st => {
      social = st;
      const reqs = Object.keys(st.requests).length, invs = Object.keys(st.invites).length;
      badge.textContent = reqs + invs ? String(reqs + invs) : '';
      for (const id in st.invites) if (!seenInvites.has(id)) {
        seenInvites.add(id);
        const v = st.invites[id];
        if (Date.now() - (v.at || 0) > 600000) { Cloud.clearInvite(id); continue; }
        Sfx.play('coin');
        toast(`${v.name} invited you to ${gameName(v.game)}. Open Friends to join.`);
      }
      drawPanel();
    });
  }
  function drawPanel() {
    if (!panelOpen || !social) return;
    const st = social;
    const results = el('div', { class: 'stack' });
    const search = el('input', { type: 'search', placeholder: 'Find players by username', 'aria-label': 'Find players' });
    const find = el('form', { class: 'row', style: 'flex-wrap:nowrap', onsubmit: async e => {
      e.preventDefault();
      results.replaceChildren(el('p', { class: 'note' }, 'Searching…'));
      const found = await Cloud.findPlayers(search.value);
      results.replaceChildren(...found.map(p => el('div', { class: 'frow' }, el('span', {}, '👤 ' + p.name),
        st.friends[p.uid] ? el('span', { class: 'note', style: 'margin:0' }, 'Friend') : el('button', { class: 'btn small', onclick: async ev => { ev.target.disabled = true; await Cloud.request(p.uid); ev.target.textContent = 'Sent'; } }, 'Add'))));
      if (!found.length) results.append(el('p', { class: 'note' }, 'No players found.'));
    } }, search, el('button', { class: 'btn small' }, 'Find'));
    const section = (t, ...kids) => el('section', {}, el('h3', {}, t), ...kids);
    const invites = Object.entries(st.invites).map(([id, v]) => el('div', { class: 'frow' }, el('span', {}, `🎮 ${v.name}: ${gameName(v.game)}`),
      el('span', {}, el('button', { class: 'btn small', onclick: () => { Cloud.clearInvite(id); joinRoom(v.game, v.code); } }, 'Join'), ' ', el('button', { class: 'btn alt small', onclick: () => Cloud.clearInvite(id) }, '✕'))));
    const reqs = Object.entries(st.requests).map(([uid, v]) => el('div', { class: 'frow' }, el('span', {}, '👋 ' + v.name),
      el('span', {}, el('button', { class: 'btn small', onclick: () => Cloud.accept(uid, v.name) }, 'Accept'), ' ', el('button', { class: 'btn alt small', onclick: () => Cloud.decline(uid) }, 'Decline'))));
    const friends = Object.entries(st.friends).sort((a, b) => !!st.live[b[0]] - !!st.live[a[0]]).map(([uid, v]) => {
      const live = st.live[uid], where = live && live.game ? `Playing ${gameName(live.game)}` : live ? 'Online' : 'Offline';
      return el('div', { class: 'frow' }, el('span', {}, el('i', { class: 'dot' + (live ? ' on' : '') }), ` ${v.name} `, el('small', { class: 'note' }, where)),
        el('span', {}, live && live.room ? el('button', { class: 'btn small', onclick: () => joinRoom(live.game, live.room) }, 'Join') : null,
          ctxRoom() && live ? el('button', { class: 'btn small', onclick: async e => { e.target.disabled = true; await Cloud.invite(uid, ctxRoom().game, ctxRoom().code); e.target.textContent = 'Invited'; } }, 'Invite') : null,
          ' ', el('button', { class: 'btn alt small', title: 'Remove friend', 'aria-label': 'Remove ' + v.name, onclick: () => { if (confirm(`Remove ${v.name} from your friends?`)) Cloud.unfriend(uid); } }, '✕')));
    });
    panel.replaceChildren(el('div', { class: 'fhead' }, el('h2', {}, 'Friends'), el('button', { class: 'btn alt small', 'aria-label': 'Close friends', onclick: togglePanel }, '✕')),
      invites.length ? section('Invites', ...invites) : null,
      reqs.length ? section('Friend requests', ...reqs) : null,
      section('Your friends', ...(friends.length ? friends : [el('p', { class: 'note' }, 'No friends yet. Find players below.')])),
      section('Add a friend', find, results));
  }
  const ctxRoom = () => window.__room && !window.__room.closed ? window.__room : null;
  function togglePanel() {
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    if (panelOpen) { drawPanel(); if (!social) panel.replaceChildren(el('p', { class: 'note' }, 'Loading…')); }
  }

  function topbar() {
    return el('header', { class: 'top' },
      el('a', { class: 'logo', href: '#/', style: 'text-decoration:none' }, "Ackp's Free Multi Game"),
      el('span', {}, '👤 ' + user.name),
      el('button', { class: 'btn alt small', onclick: togglePanel }, '👥 Friends ', badge),
      el('button', { class: 'btn alt small', 'aria-label': 'Toggle sound', onclick: e => { e.currentTarget.textContent = Sfx.toggle() ? '🔇' : '🔊'; } }, Sfx.muted ? '🔇' : '🔊'),
      el('button', { class: 'btn alt small', onclick: async () => { if (socialOff) socialOff(); socialOff = null; social = null; await Cloud.logOut(); location.hash = '#/'; route(); } }, 'Log out'));
  }

  function hub() {
    const best = g => Store.get(`u.${user.key}.best.${g.id}`);
    const played = games.filter(g => best(g) != null).length;
    let filter = 'All', query = '';
    const grid = el('div', { class: 'grid' });
    const draw = () => {
      const q = query.toLowerCase();
      const list = games.filter(g => (filter === 'All' || (filter === 'Online') === !!g.online) && (g.name + g.desc).toLowerCase().includes(q));
      grid.replaceChildren(...list.map((g, i) => {
        const hue = games.indexOf(g) * 36, b = best(g);
        const card = el('a', { class: 'card', style: `animation-delay:${i * 45}ms;--hue:${hue}`, href: '#/play/' + g.id,
          onpointermove: e => {
            if (e.pointerType !== 'mouse') return;
            const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
            card.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-4px)`;
          },
          onpointerleave: () => { card.style.transform = ''; } },
          el('div', { class: 'art' }, el('span', { class: 'ico', 'aria-hidden': 'true', style: `animation-delay:${i * -.4}s` }, g.icon)),
          el('h3', {}, g.name), el('p', {}, g.desc),
          el('div', { class: 'cardfoot' },
            el('span', {}, el('span', { class: 'tag' + (g.online ? '' : ' solo') }, g.online ? 'Solo + online' : 'Solo'),
              b == null ? null : el('span', { class: 'tag solo' }, `Best ${g.fmtBest ? g.fmtBest(b) : fmt(b)}`)),
            el('span', { class: 'playcue' }, 'Play ▶')));
        return card;
      }));
      if (!list.length) grid.append(el('p', { class: 'note' }, 'No games match that search.'));
    };
    const chips = el('div', { class: 'row' });
    const drawChips = () => chips.replaceChildren(...['All', 'Online', 'Solo only'].map(c => el('button', { class: 'chip' + (filter === c ? ' on' : ''), onclick: () => { filter = c; drawChips(); draw(); } }, c)));
    drawChips(); draw();
    show(topbar(), el('main', {},
      el('section', { class: 'hero' },
        el('div', {}, el('h1', {}, `Welcome, ${user.name}`), el('p', {}, `${games.length} free games. You've set a score in ${played}.`),
          el('div', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: `width:${played / games.length * 100}%` }))),
        el('div', { class: 'heroart', 'aria-hidden': 'true' }, ...['🎮', '🏎️', '🐟', '⛏️'].map((e, i) => el('span', { style: `animation-delay:${i * -.8}s` }, e)))),
      el('div', { class: 'filters' }, chips, el('input', { type: 'search', placeholder: 'Search games', 'aria-label': 'Search games', oninput: e => { query = e.target.value; draw(); } })),
      grid));
  }

  function play(g) {
    const stage = el('div', { class: 'stage' });
    const bestPill = el('span', { class: 'pill' });
    const drawBest = () => {
      const b = Store.get(`u.${user.key}.best.${g.id}`);
      bestPill.textContent = b == null ? 'No best yet' : `🏆 ${g.fmtBest ? g.fmtBest(b) : fmt(b)}`;
    };
    show(topbar(), el('main', {},
      el('div', { class: 'bar' },
        el('a', { class: 'btn alt small', href: '#/', style: 'text-decoration:none;display:inline-flex;align-items:center' }, '← Games'),
        el('h2', {}, `${g.icon} ${g.name}`), bestPill,
        el('button', { class: 'btn alt small', 'aria-label': 'Fullscreen', onclick: () => {
          if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
        } }, '⛶')),
      stage));
    drawBest();
    let cleanups = [];
    const pfx = `u.${user.key}.`;
    const ctx = {
      stage, user, keys: new Set(), room: null,
      data: (k, d) => Store.get(pfx + g.id + '.' + k, d),
      save: (k, v) => Store.set(pfx + g.id + '.' + k, v),
      best: () => Store.get(pfx + 'best.' + g.id),
      // Records a score if it beats the stored one; returns true on a new best.
      score(v, lower) {
        const b = ctx.best();
        if (b == null || (lower ? v < b : v > b)) {
          Store.set(pfx + 'best.' + g.id, v);
          if (g.id !== 'clicker') toast('🏆 New best!');
          drawBest();
          return true;
        }
        return false;
      },
      add: f => cleanups.push(f),
      on(t, type, f, opts) { t.addEventListener(type, f, opts); cleanups.push(() => t.removeEventListener(type, f, opts)); },
      loop(f) {
        let id, last = performance.now(), run = true;
        const tick = now => {
          if (!run) return;
          f(Math.min((now - last) / 1000, 0.05), now);
          last = now;
          id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        const stop = () => { run = false; cancelAnimationFrame(id); };
        cleanups.push(stop);
        return stop;
      },
      every(ms, f) { const id = setInterval(f, ms); cleanups.push(() => clearInterval(id)); },
      // Removes everything from the current round. The room survives until the player leaves the game.
      clear() {
        cleanups.forEach(f => { try { f(); } catch (e) { console.error(e); } });
        cleanups = [];
        ctx.keys.clear();
        stage.replaceChildren();
        const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
        ctx.on(window, 'keydown', e => {
          if (e.target.matches && e.target.matches('input,select,textarea')) return;
          ctx.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
          if (block.includes(e.key)) e.preventDefault();
        });
        ctx.on(window, 'keyup', e => ctx.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
        ctx.on(window, 'blur', () => ctx.keys.clear());
      },
      canvas(w, h) {
        const c = el('canvas', { width: w, height: h });
        stage.append(c);
        return c;
      },
      pos(e, c) { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; },
      hud() { const h = el('div', { class: 'hud', role: 'status' }); stage.prepend(h); return h; },
      help(t) { stage.append(el('p', { class: 'help' }, t)); },
      // On-screen keys for phones; [label, key] pairs feed the same key set as the keyboard.
      touch(pairs) {
        const t = el('div', { class: 'touch' }, ...pairs.map(([label, key]) => {
          const press = e => { e.preventDefault(); ctx.keys.add(key); window.dispatchEvent(new KeyboardEvent('keydown', { key })); };
          const lift = e => { e.preventDefault(); ctx.keys.delete(key); };
          return el('button', { onpointerdown: press, onpointerup: lift, onpointerleave: lift, onpointercancel: lift, 'aria-label': key }, label);
        }));
        stage.append(t);
      },
      message(title, text, buttons = []) {
        let confetti = false;
        if (/over|boom|eaten|fell|draw| won$/i.test(title)) Sfx.play('lose');
        else if (/welcome/i.test(title)) Sfx.play('coin');
        else if (!/closed|could not/i.test(title)) { Sfx.play('win'); confetti = true; }
        const o = el('div', { class: 'overlay' }, el('div', { class: 'box' },
          el('h3', {}, title), text ? el('p', { class: 'note' }, text) : null,
          el('div', { class: 'stack' }, ...buttons.map((b, i) => el('button', { class: 'btn' + (i ? ' alt' : ''), onclick: () => { o.remove(); b.fn(); } }, b.label)))));
        if (confetti) for (let i = 0; i < 36; i++) o.append(el('i', { class: 'confetti', style: `left:${Math.random() * 100}%;background:hsl(${Math.random() * 360} 90% 60%);animation-delay:${Math.random() * .5}s;animation-duration:${1.2 + Math.random()}s` }));
        stage.append(o);
        return o;
      },
      restart: () => mount(),
      // Solo / create room / join room. start(room, seed) runs the round; room is null when solo.
      lobby({ intro, start, extra = [] }) {
        ctx.clear();
        const err = el('p', { class: 'err', role: 'alert' });
        const code = el('input', { class: 'code', style: 'font-size:16px', maxLength: 5, placeholder: 'CODE', 'aria-label': 'Room code', autocapitalize: 'characters' });
        const fail = e => { err.textContent = e.message; };
        const box = el('div', { class: 'box lobby' }, el('div', { class: 'lobbyicon', 'aria-hidden': 'true' }, g.icon), el('h3', {}, g.name), el('p', { class: 'note' }, g.desc), intro ? el('p', { class: 'note' }, intro) : null,
          el('div', { class: 'stack' },
            el('button', { class: 'btn', onclick: () => start(null, Math.floor(Math.random() * 1e9)) }, 'Play solo'),
            ...extra.map(x => el('button', { class: 'btn alt', onclick: x.fn }, x.label)),
            el('button', { class: 'btn alt', onclick: async e => {
              e.target.disabled = true; err.textContent = 'Creating room…';
              try { waiting(await Net.host(g.id, user.name)); } catch (x) { fail(x); e.target.disabled = false; }
            } }, 'Create online room'),
            el('form', { class: 'row', style: 'flex-wrap:nowrap', onsubmit: async e => {
              e.preventDefault();
              if (!code.value.trim()) return;
              err.textContent = 'Joining…';
              try { waiting(await Net.join(g.id, code.value.trim().toUpperCase(), user.name)); } catch (x) { fail(x); }
            } }, code, el('button', { class: 'btn alt' }, 'Join'))), err);
        stage.append(box);

        // A friend's invite or a Join click from the friends list lands here.
        let pend = null;
        try { pend = JSON.parse(sessionStorage.getItem('amg.join') || 'null'); } catch (x) {}
        if (pend && pend.game === g.id) {
          sessionStorage.removeItem('amg.join');
          err.textContent = 'Joining your friend…';
          Net.join(g.id, pend.code, user.name).then(waiting, fail);
        }
        function waiting(room) {
          ctx.room = room;
          ctx.clear();
          room.onClose(why => { ctx.room = null; ctx.clear(); ctx.message('Room closed', why, [{ label: 'Back', fn: ctx.restart }]); });
          const list = el('ul', { class: 'players' });
          const drawPlayers = p => list.replaceChildren(...p.map(x => el('li', {}, '👤 ' + x.name)));
          room.onPlayers(drawPlayers);
          drawPlayers(room.players);
          const off = room.onMessage(d => {
            if (d.t === 'start') { off(); start(room, d.seed, d.opts); }
          });
          stage.append(el('div', { class: 'box' }, el('h3', {}, 'Room code'), el('div', { class: 'roomcode' }, room.code),
            el('p', { class: 'note' }, 'Give this code to your friends, or invite them from 👥 Friends at the top.'), list,
            room.isHost ? el('button', { class: 'btn', onclick: () => {
              const seed = Math.floor(Math.random() * 1e9);
              room.started = true; off(); room.send({ t: 'start', seed }); start(room, seed);
            } }, 'Start game') : el('p', { class: 'note' }, 'Waiting for the host to start…'),
            el('div', { class: 'stack' }, el('button', { class: 'btn alt', onclick: ctx.restart }, 'Leave room'))));
        }
      },
    };
    const leave = () => { if (ctx.room) { ctx.room.close(); ctx.room = null; } };
    // The friends panel reads the open room to offer invites.
    Object.defineProperty(ctx, 'room', { get: () => window.__room || null, set: v => { window.__room = v; } });
    function mount() {
      leave();
      ctx.clear();
      const r = g.mount(ctx);
      if (r && r.catch) r.catch(e => ctx.message('Could not start', e.message, [{ label: 'Try again', fn: ctx.restart }]));
    }
    active = () => { ctx.clear(); stage.replaceChildren(); leave(); };
    mount();
  }

  let routing = 0;
  async function route() {
    if (active) { active(); active = null; }
    if (!unlocked()) return gate();
    const ticket = ++routing;
    if (!Cloud.me) {
      show(el('div', { class: 'center' }, el('p', { class: 'note' }, 'Connecting…')));
      try { await Cloud.start(); } catch (e) { show(el('div', { class: 'center' }, el('div', { class: 'box' }, el('p', { class: 'err' }, e.message), el('button', { class: 'btn', onclick: () => location.reload() }, 'Retry')))); return; }
      if (ticket !== routing) return;
    }
    if (!Cloud.me) return auth();
    user = { key: Cloud.me.key, name: Cloud.me.name, uid: Cloud.me.uid };
    if (!socialOff) { watchSocial(); document.body.append(panel); }
    const m = location.hash.match(/^#\/play\/([\w-]+)/);
    const g = m && games.find(x => x.id === m[1]);
    g ? play(g) : hub();
  }

  return {
    register: g => games.push(g),
    boot() {
      backdrop();
      document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button:not(.gem),a.card,a.btn')) Sfx.play('click'); });
      window.addEventListener('hashchange', route); route(); },
  };
})();
