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
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
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
  const s = el('script', { src: THREE_URL, onload: ok, onerror: () => no(new Error('Could not load the 3D engine.')) });
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
          route();
        } else { err.textContent = 'Wrong code.'; input.value = ''; input.focus(); }
      } }, input, err, el('button', { class: 'btn' }, 'Enter')))));
    input.focus();
  }

  function auth(mode = 'login') {
    const name = el('input', { placeholder: 'Username', autocomplete: 'username', maxLength: 20, required: true, 'aria-label': 'Username' });
    const pw = el('input', { type: 'password', placeholder: 'Password', minLength: 4, required: true, 'aria-label': 'Password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    const err = el('p', { class: 'err', role: 'alert' });
    const submit = async e => {
      e.preventDefault();
      const n = name.value.trim(), key = n.toLowerCase(), users = Store.get('users', {});
      if (!/^[\w .-]{2,20}$/.test(n)) { err.textContent = 'Use 2-20 letters, numbers, spaces, dots or dashes.'; return; }
      if (mode === 'signup') {
        if (users[key]) { err.textContent = 'That username is taken on this device.'; return; }
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        users[key] = { name: n, salt, hash: await hashPw(pw.value, salt), created: Date.now() };
        Store.set('users', users);
      } else {
        const u = users[key];
        if (!u || await hashPw(pw.value, u.salt) !== u.hash) { err.textContent = 'Wrong username or password.'; return; }
      }
      Store.set('session', key);
      route();
    };
    show(el('div', { class: 'center' }, el('div', { class: 'box' },
      el('div', { class: 'logo' }, "Ackp's Free Multi Game"),
      el('div', { class: 'tabs' },
        el('button', { class: 'btn' + (mode === 'login' ? '' : ' alt'), onclick: () => auth('login') }, 'Log in'),
        el('button', { class: 'btn' + (mode === 'signup' ? '' : ' alt'), onclick: () => auth('signup') }, 'Create account')),
      el('form', { onsubmit: submit }, name, pw, err, el('button', { class: 'btn' }, mode === 'login' ? 'Log in' : 'Create account')),
      el('p', { class: 'note' }, 'Accounts and saves are stored in this browser only.'))));
    name.focus();
  }

  function topbar() {
    return el('header', { class: 'top' },
      el('a', { class: 'logo', href: '#/', style: 'text-decoration:none' }, "Ackp's Free Multi Game"),
      el('span', {}, '👤 ' + user.name),
      el('button', { class: 'btn alt small', onclick: () => { Store.del('session'); location.hash = '#/'; route(); } }, 'Log out'));
  }

  function hub() {
    const best = g => {
      const b = Store.get(`u.${user.key}.best.${g.id}`);
      return b == null ? null : el('span', { class: 'tag solo' }, `Best ${g.fmtBest ? g.fmtBest(b) : fmt(b)}`);
    };
    show(topbar(), el('main', {},
      el('h2', {}, 'Pick a game'),
      el('div', { class: 'grid' }, ...games.map(g => el('a', { class: 'card', href: '#/play/' + g.id },
        el('div', { class: 'ico', 'aria-hidden': 'true' }, g.icon),
        el('h3', {}, g.name),
        el('p', {}, g.desc),
        el('span', { class: 'tag' + (g.online ? '' : ' solo') }, g.online ? 'Solo + online' : 'Solo'), best(g))))));
  }

  function play(g) {
    const stage = el('div', { class: 'stage' });
    show(topbar(), el('main', {},
      el('div', { class: 'bar' },
        el('a', { class: 'btn alt small', href: '#/', style: 'text-decoration:none;display:inline-flex;align-items:center' }, '← Games'),
        el('h2', {}, `${g.icon} ${g.name}`)),
      stage));
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
        if (b == null || (lower ? v < b : v > b)) { Store.set(pfx + 'best.' + g.id, v); return true; }
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
        const o = el('div', { class: 'overlay' }, el('div', { class: 'box' },
          el('h3', {}, title), text ? el('p', { class: 'note' }, text) : null,
          el('div', { class: 'stack' }, ...buttons.map((b, i) => el('button', { class: 'btn' + (i ? ' alt' : ''), onclick: () => { o.remove(); b.fn(); } }, b.label)))));
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
        const box = el('div', { class: 'box' }, el('h3', {}, g.name), intro ? el('p', { class: 'note' }, intro) : null,
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
            el('p', { class: 'note' }, 'Give this code to your friends. Everyone must play the same game.'), list,
            room.isHost ? el('button', { class: 'btn', onclick: () => {
              const seed = Math.floor(Math.random() * 1e9);
              room.started = true; off(); room.send({ t: 'start', seed }); start(room, seed);
            } }, 'Start game') : el('p', { class: 'note' }, 'Waiting for the host to start…'),
            el('div', { class: 'stack' }, el('button', { class: 'btn alt', onclick: ctx.restart }, 'Leave room'))));
        }
      },
    };
    const leave = () => { if (ctx.room) { ctx.room.close(); ctx.room = null; } };
    function mount() {
      leave();
      ctx.clear();
      const r = g.mount(ctx);
      if (r && r.catch) r.catch(e => ctx.message('Could not start', e.message, [{ label: 'Try again', fn: ctx.restart }]));
    }
    active = () => { ctx.clear(); stage.replaceChildren(); leave(); };
    mount();
  }

  function route() {
    if (active) { active(); active = null; }
    if (!unlocked()) return gate();
    const key = Store.get('session');
    const users = Store.get('users', {});
    if (!key || !users[key]) return auth();
    user = { key, name: users[key].name };
    const m = location.hash.match(/^#\/play\/([\w-]+)/);
    const g = m && games.find(x => x.id === m[1]);
    g ? play(g) : hub();
  }

  return {
    register: g => games.push(g),
    boot() { window.addEventListener('hashchange', route); route(); },
  };
})();
