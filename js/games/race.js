// Turbo Rally: top-down racing with a garage. Coins from races buy upgrades.
App.register({
  id: 'race', name: 'Turbo Rally', icon: '🏎️', online: true,
  desc: 'Race three laps, earn coins, and upgrade your car.',
  mount(ctx) {
    const UPS = {
      engine: { name: 'Engine', icon: '⚙️', desc: 'Higher top speed' },
      tires: { name: 'Tires', icon: '🛞', desc: 'Sharper turns, less grass drag' },
      nitro: { name: 'Nitro', icon: '🔥', desc: 'More boost per lap' },
    };
    const PAINTS = ['#ff4d4d', '#3fa7ff', '#ffd23f', '#3fe0c5', '#e27bff', '#ffffff'];
    const REWARD = [200, 120, 70, 40];
    const load = () => ctx.data('car', { coins: 0, engine: 0, tires: 0, nitro: 0, paint: 0 });
    const cost = l => 100 * (l + 1) * (l + 1);
    menu();

    function menu() {
      ctx.lobby({ intro: garageLine(), start: race, extra: [{ label: '🔧 Garage', fn: garage }] });
    }
    function garageLine() {
      const c = load();
      return `🪙 ${c.coins} coins. Engine ${c.engine}, tires ${c.tires}, nitro ${c.nitro}.`;
    }
    function garage() {
      ctx.clear();
      const panel = el('div', { class: 'panel', style: 'max-width:760px' });
      ctx.stage.append(panel);
      const draw = () => {
        const car = load();
        panel.replaceChildren(el('h3', {}, `🪙 ${car.coins} coins`),
          el('div', { class: 'shop', style: 'margin:12px 0' }, ...Object.entries(UPS).map(([k, u]) => {
            const maxed = car[k] >= 5, price = cost(car[k]);
            return el('button', { disabled: maxed || car.coins < price, onclick: () => { car.coins -= price; car[k]++; ctx.save('car', car); draw(); } },
              el('span', {}, `${u.icon} ${u.name} (${car[k]}/5)`, el('small', {}, u.desc)),
              el('b', {}, maxed ? 'MAX' : `🪙${price}`));
          })),
          el('div', { class: 'tools' }, ...PAINTS.map((p, i) => el('button', { class: i === car.paint ? 'on' : '', 'aria-label': 'Paint ' + (i + 1), style: 'background:' + p, onclick: () => { car.paint = i; ctx.save('car', car); draw(); } }))),
          el('div', { class: 'row', style: 'margin-top:14px' }, el('button', { class: 'btn', onclick: menu }, 'Back')));
      };
      draw();
    }

    function race(room, seed) {
      ctx.clear();
      const car = load(), W = 960, H = 600, LAPS = 3, N = 260, ROAD = 85;
      const c = ctx.canvas(W, H), g = c.getContext('2d'), hud = ctx.hud();
      ctx.help('Arrows or WASD to drive, Space for nitro, R to return to the road.');
      ctx.touch([['←', 'ArrowLeft'], ['→', 'ArrowRight'], ['▲', 'ArrowUp'], ['▼', 'ArrowDown'], ['🔥', ' ']]);
      const r = rng(seed), a1 = r() * 6.28, a2 = r() * 6.28, a3 = r() * 6.28;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const t = i / N * Math.PI * 2, R = 1150 * (1 + .28 * Math.sin(2 * t + a1) + .16 * Math.sin(3 * t + a2) + .07 * Math.sin(5 * t + a3));
        pts.push({ x: Math.cos(t) * R * 1.25, y: Math.sin(t) * R });
      }
      const heading = i => { const a = pts[i % N], b = pts[(i + 1) % N]; return Math.atan2(b.y - a.y, b.x - a.x); };
      const a0 = heading(0), nx = -Math.sin(a0), ny = Math.cos(a0);
      const slot = room ? room.players.findIndex(p => p.id === room.me) : 0;
      const me = { x: pts[0].x + nx * ((slot % 2) ? 28 : -28) - Math.cos(a0) * 40 * (slot >> 1), y: pts[0].y + ny * ((slot % 2) ? 28 : -28) - Math.sin(a0) * 40 * (slot >> 1), a: a0, v: 0, idx: 0, prog: 0, nitro: 60 + car.nitro * 40, boost: 0 };
      const MAX = 430 + car.engine * 55, ACC = 300 + car.engine * 45, TURN = 2.5 + car.tires * .25, GRASS = .42 + car.tires * .06;
      const power = car.engine + car.tires + car.nitro;
      const bots = room ? [] : [.8, .88, .96].map((f, i) => ({ name: ['Rusty', 'Blaze', 'Viper'][i], col: ['#9aa0a6', '#ff9f43', '#7bed9f'][i], f, off: (i - 1) * 30, prog: -(i + 1) * 1.2, x: 0, y: 0, a: a0 }));
      const others = {};
      const finished = [];
      let time = -3, done = false;
      const total = LAPS * N;
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'c') others[from] = d;
          if (d.t === 'fin' && !finished.includes(from)) finished.push(from);
          if (d.t === 'left') delete others[from];
        }));
        ctx.every(50, () => room.send({ t: 'c', x: me.x, y: me.y, a: me.a, p: me.prog, col: PAINTS[car.paint] }));
      }
      const ptAt = p => {
        const q = ((p % N) + N) % N, i = Math.floor(q), f = q - i, A = pts[i], B = pts[(i + 1) % N];
        return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, a: heading(i) };
      };
      const drawCar = (x, y, a, col, label) => {
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = '#111'; g.fillRect(-16, -14, 9, 28); g.fillRect(8, -14, 9, 28);
        g.fillStyle = col; g.fillRect(-20, -10, 40, 20);
        g.fillStyle = '#1b2a3a'; g.fillRect(-5, -8, 13, 16);
        g.restore();
        if (label) { g.fillStyle = '#fff'; g.font = '13px Rubik'; g.textAlign = 'center'; g.fillText(label, x, y - 24); }
      };
      function finish() {
        done = true;
        if (room) { finished.push(room.me); room.send({ t: 'fin' }); }
        const place = room ? finished.length : 1 + bots.filter(b => b.prog >= total).length;
        const coins = REWARD[Math.min(place - 1, 3)];
        const fresh = load();
        fresh.coins += coins; ctx.save('car', fresh);
        const nb = ctx.score(Math.round(time * 10) / 10, true);
        ctx.message(['🥇 1st place!', '🥈 2nd place', '🥉 3rd place'][place - 1] || `Place ${place}`, `Time ${time.toFixed(1)}s. You earned 🪙${coins}.${nb ? ' New best time!' : ''}`, [{ label: 'Garage', fn: garage }, ...(room ? [{ label: 'Menu', fn: ctx.restart }] : [{ label: 'Race again', fn: () => race(null, Math.floor(Math.random() * 1e9)) }])]);
      }
      ctx.loop(dt => {
        time += dt;
        const go = time >= 0 && !done, k = ctx.keys;
        if (go) {
          let best = Infinity, bi = me.idx;
          for (let o = -14; o <= 14; o++) {
            const i = (me.idx + o + N) % N, d = Math.hypot(pts[i].x - me.x, pts[i].y - me.y);
            if (d < best) { best = d; bi = i; }
          }
          let delta = bi - me.idx;
          if (delta > N / 2) delta -= N;
          if (delta < -N / 2) delta += N;
          me.idx = bi; me.prog += delta;
          const onRoad = best < ROAD;
          const up = k.has('ArrowUp') || k.has('w'), dn = k.has('ArrowDown') || k.has('s');
          const lf = k.has('ArrowLeft') || k.has('a'), rt = k.has('ArrowRight') || k.has('d');
          const nitroOn = k.has(' ') && me.nitro > 0 && up;
          if (nitroOn) me.nitro -= 40 * dt;
          const lim = (onRoad ? MAX : MAX * GRASS) * (nitroOn ? 1.4 : 1);
          if (up) me.v += ACC * (nitroOn ? 1.8 : 1) * dt;
          if (dn) me.v -= (me.v > 0 ? 650 : 200) * dt;
          if (!up && !dn) me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), 120 * dt);
          if (me.v > lim) me.v = Math.max(lim, me.v - 600 * dt);
          if (me.v < -140) me.v = -140;
          const steer = (rt ? 1 : 0) - (lf ? 1 : 0);
          me.a += steer * TURN * dt * clamp(Math.abs(me.v) / 170, 0, 1) * Math.sign(me.v || 1);
          me.x += Math.cos(me.a) * me.v * dt; me.y += Math.sin(me.a) * me.v * dt;
          if (k.has('r')) { const p = pts[me.idx]; me.x = p.x; me.y = p.y; me.a = heading(me.idx); me.v = 0; }
          if (me.prog >= total) finish();
          for (const b of bots) {
            const speed = (360 + power * 28) * b.f;
            b.prog += speed * dt / (Math.PI * 2 * 1150 * 1.1 / N);
          }
        }
        for (const b of bots) {
          const p = ptAt(b.prog);
          b.x = p.x - Math.sin(p.a) * b.off; b.y = p.y + Math.cos(p.a) * b.off; b.a = p.a;
        }
        g.fillStyle = '#3f9b48'; g.fillRect(0, 0, W, H);
        g.save(); g.translate(W / 2, H / 2); g.rotate(-me.a - Math.PI / 2); g.translate(-me.x, -me.y);
        const stroke = (w, col, dash) => {
          g.lineWidth = w; g.strokeStyle = col; g.setLineDash(dash || []); g.lineJoin = 'round';
          g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
        };
        stroke(ROAD * 2 + 16, '#fff', [40, 40]);
        g.setLineDash([]);
        stroke(ROAD * 2, '#3c3f46');
        stroke(4, '#ffd23f', [36, 36]);
        g.setLineDash([]);
        g.save(); g.translate(pts[0].x, pts[0].y); g.rotate(a0);
        for (let i = -4; i < 4; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#000'; g.fillRect(j * 20 - 20, i * 21.25, 20, 21.25); }
        g.restore();
        for (const b of bots) drawCar(b.x, b.y, b.a, b.col, b.name);
        for (const id in others) { const o = others[id]; drawCar(o.x, o.y, o.a, o.col, (room.players.find(p => p.id === id) || {}).name); }
        drawCar(me.x, me.y, me.a, PAINTS[car.paint]);
        g.restore();
        const all = [{ p: me.prog }, ...bots.map(b => ({ p: b.prog })), ...Object.values(others).map(o => ({ p: o.p }))];
        const pos = 1 + all.filter(x => x.p > me.prog).length;
        hud.replaceChildren(el('span', {}, 'Lap ', el('b', {}, `${clamp(Math.floor(me.prog / N) + 1, 1, LAPS)}/${LAPS}`)), el('span', {}, 'Position ', el('b', {}, `${pos}/${all.length}`)),
          el('span', {}, 'Speed ', el('b', {}, Math.abs(Math.round(me.v / 3)))), el('span', {}, '🔥 ', el('b', {}, Math.max(0, Math.round(me.nitro)))), el('span', {}, '⏱ ', el('b', {}, Math.max(0, time).toFixed(1))));
        if (time < 0) { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 6; g.font = '64px "Press Start 2P"'; g.textAlign = 'center'; const s = String(Math.ceil(-time)); g.strokeText(s, W / 2, 200); g.fillText(s, W / 2, 200); }
      });
    }
  },
});
