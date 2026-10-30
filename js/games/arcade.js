// Minesweeper, Flappy Wings and Fish Frenzy.
App.register({
  id: 'mines', name: 'Minesweeper', icon: '💣', online: true,
  desc: 'Clear the field. Race friends on the same board.',
  fmtBest: b => b + 's',
  mount(ctx) {
    const LEVELS = { Easy: [9, 9, 10], Medium: [16, 16, 40], Hard: [24, 16, 80] };
    const COL = ['', '#6ec6ff', '#7ee081', '#ff8a80', '#c9a2ff', '#ffb74d', '#4dd0e1', '#fff', '#bbb'];
    const opts = lvl => ctx.lobby({ intro: `${lvl} board. Change the size with the buttons below.`,
      extra: Object.keys(LEVELS).filter(k => k !== lvl).map(k => ({ label: 'Switch to ' + k, fn: () => opts(k) })),
      start: (room, seed) => play(room, seed, lvl) });
    opts('Easy');

    function play(room, seed, lvl) {
      ctx.clear();
      // Online rounds always use Medium so everybody has the same board.
      const [W, H, M] = room ? LEVELS.Medium : LEVELS[lvl];
      const cells = Array.from({ length: W * H }, () => ({ mine: false, open: false, flag: false, n: 0 }));
      const hud = ctx.hud(), around = i => {
        const x = i % W, y = (i - x) / W, r = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const a = x + dx, b = y + dy;
          if ((dx || dy) && a >= 0 && b >= 0 && a < W && b < H) r.push(b * W + a);
        }
        return r;
      };
      let placed = false, over = false, flagMode = false, opened = 0, t0 = 0;
      const rivals = {};
      const grid = el('div', { class: 'mines', style: `grid-template-columns:repeat(${W},30px)` });
      const btns = cells.map((_, i) => el('button', { 'aria-label': `Cell ${i + 1}`,
        onclick: () => flagMode ? flag(i) : open(i),
        oncontextmenu: e => { e.preventDefault(); flag(i); } }));
      grid.append(...btns);
      const fbtn = el('button', { class: 'btn alt small', onclick: () => { flagMode = !flagMode; fbtn.textContent = flagMode ? '🚩 Flag mode: on' : '🚩 Flag mode: off'; } }, '🚩 Flag mode: off');
      ctx.stage.append(grid, fbtn);
      ctx.help('Click to open a cell. Right-click (or flag mode) to place a flag.');

      const draw = i => {
        const c = cells[i], b = btns[i];
        b.className = c.open ? 'open' + (c.mine ? ' boom' : '') : '';
        b.textContent = c.open ? (c.mine ? '💣' : c.n || '') : c.flag ? '🚩' : '';
        b.style.color = COL[c.n] || '';
      };
      const place = first => {
        const r = rng(seed), safe = new Set([first, ...around(first)]);
        let left = M;
        while (left) {
          const i = Math.floor(r() * cells.length);
          if (!cells[i].mine && !safe.has(i)) { cells[i].mine = true; left--; }
        }
        cells.forEach((c, i) => { c.n = around(i).filter(a => cells[a].mine).length; });
        placed = true; t0 = performance.now();
      };
      const flag = i => { if (!over && !cells[i].open) { cells[i].flag = !cells[i].flag; draw(i); } };
      function open(i) {
        if (over || cells[i].flag || cells[i].open) return;
        if (!placed) place(i);
        const stack = [i];
        while (stack.length) {
          const a = stack.pop(), c = cells[a];
          if (c.open || c.flag) continue;
          c.open = true; opened++; draw(a);
          if (c.mine) return lose();
          if (!c.n) stack.push(...around(a));
        }
        if (room) room.send({ t: 'p', pct: Math.round(opened / (W * H - M) * 100) });
        if (opened === W * H - M) win();
      }
      const time = () => Math.floor((performance.now() - t0) / 1000);
      function end(title, text) {
        over = true;
        ctx.message(title, text, [room ? { label: 'Back to menu', fn: ctx.restart } : { label: 'Play again', fn: () => play(null, Math.floor(Math.random() * 1e9), lvl) }, ...(room ? [] : [{ label: 'Change level', fn: ctx.restart }])]);
      }
      function win() {
        const s = time();
        if (room) room.send({ t: 'won', s });
        end('You cleared it!', `${s} seconds.${ctx.score(s, true) ? ' New best!' : ''}`);
      }
      function lose() {
        cells.forEach((c, i) => { if (c.mine) { c.open = true; draw(i); } });
        if (room) room.send({ t: 'dead' });
        end('Boom!', 'You hit a mine.');
      }
      if (room) ctx.add(room.onMessage((d, from) => {
        const p = room.players.find(x => x.id === from);
        if (!p) return;
        if (d.t === 'p') rivals[p.name] = d.pct + '%';
        if (d.t === 'dead') rivals[p.name] = '💥';
        if (d.t === 'won' && !over) { over = true; end(`${p.name} won`, `They cleared the board in ${d.s} seconds.`); }
      }));
      ctx.every(250, () => {
        hud.replaceChildren(el('span', {}, '⏱ ', el('b', {}, placed ? time() : 0)), el('span', {}, '💣 ', el('b', {}, M - cells.filter(c => c.flag).length)),
          ...Object.entries(rivals).map(([n, v]) => el('span', {}, `${n}: `, el('b', {}, v))));
      });
    }
  },
});

App.register({
  id: 'flappy', name: 'Flappy Wings', icon: '🐤', online: true,
  desc: 'Flap through the pipes. See friends fly beside you.',
  mount(ctx) {
    ctx.lobby({ intro: 'Last bird flying wins.', start: play });
    function play(room, seed) {
      ctx.clear();
      const W = 480, H = 640, GAP = 165, SPACE = 230, SPEED = 170;
      const c = ctx.canvas(W, H), g = c.getContext('2d');
      ctx.help('Space, up arrow, click or tap to flap.');
      const gapAt = i => 110 + rng(seed + i * 7919)() * (H - 320);
      let y = H / 2, v = 0, dist = 0, alive = true, begun = !!room, score = 0;
      const others = {};
      const flap = () => { if (alive) { begun = true; v = -400; } };
      ctx.on(c, 'pointerdown', e => { e.preventDefault(); flap(); });
      ctx.on(window, 'keydown', e => { if ((e.key === ' ' || e.key === 'ArrowUp') && !e.repeat) flap(); });
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'b') others[from] = d;
          if (d.t === 'left') delete others[from];
        }));
        ctx.every(66, () => room.send({ t: 'b', y, alive, score }));
      }
      const bird = (x, by, col, vy, label) => {
        g.save(); g.translate(x, by); g.rotate(clamp(vy / 600, -.5, 1));
        g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 18, 14, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(8, -5, 5, 0, 7); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.arc(10, -5, 2, 0, 7); g.fill();
        g.fillStyle = '#ff8c1a'; g.fillRect(15, -2, 10, 6);
        g.restore();
        if (label) { g.fillStyle = '#fff'; g.font = '12px Rubik'; g.textAlign = 'center'; g.fillText(label, x, by - 22); }
      };
      const die = () => {
        alive = false;
        const nb = ctx.score(score);
        if (room) room.send({ t: 'b', y, alive, score });
        ctx.message('Game over', `Score ${score}.${nb ? ' New best!' : ''}`, room
          ? [{ label: 'Back to menu', fn: ctx.restart }]
          : [{ label: 'Play again', fn: () => play(null, Math.floor(Math.random() * 1e9)) }]);
      };
      ctx.loop(dt => {
        if (begun && alive) {
          v += 1250 * dt; y += v * dt; dist += SPEED * dt;
          score = Math.max(0, Math.floor((dist - 500 + 110) / SPACE) + 1);
          if (dist < 500 - 110) score = 0;
          if (y > H - 50 || y < 0) die();
        }
        const sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#59c3ff'); sky.addColorStop(1, '#c9f0ff');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        const first = Math.max(0, Math.floor((dist - 110) / SPACE) - 2);
        for (let i = first; i < first + 6; i++) {
          const x = 500 + i * SPACE - dist, gy = gapAt(i);
          g.fillStyle = '#3fb54a'; g.fillRect(x, 0, 62, gy); g.fillRect(x, gy + GAP, 62, H);
          g.fillStyle = '#2a8c35'; g.fillRect(x - 4, gy - 22, 70, 22); g.fillRect(x - 4, gy + GAP, 70, 22);
          if (alive && 110 + 15 > x && 110 - 15 < x + 62 && (y - 12 < gy || y + 12 > gy + GAP)) die();
        }
        g.fillStyle = '#d9b36c'; g.fillRect(0, H - 50, W, 50);
        for (const id in others) if (others[id].alive) bird(110, others[id].y, '#ffffff99', 0, (room.players.find(p => p.id === id) || {}).name);
        bird(110, y, alive ? '#ffd23f' : '#999', v);
        g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 5; g.font = '32px "Press Start 2P"'; g.textAlign = 'center';
        g.strokeText(score, W / 2, 60); g.fillText(score, W / 2, 60);
        if (!begun) { g.font = '14px "Press Start 2P"'; g.strokeText('TAP TO START', W / 2, 240); g.fillText('TAP TO START', W / 2, 240); }
      });
    }
  },
});

App.register({
  id: 'fish', name: 'Fish Frenzy', icon: '🐟', online: true,
  desc: 'Eat smaller fish, dodge bigger ones, and hunt your friends.',
  mount(ctx) {
    ctx.lobby({ intro: 'Eat anything smaller than you. Anything bigger eats you.', start: play });
    function play(room, seed) {
      ctx.clear();
      const W = 900, H = 540, c = ctx.canvas(W, H), g = c.getContext('2d');
      const hud = ctx.hud();
      ctx.help('Move with the mouse, a finger, WASD or the arrow keys.');
      const COLORS = ['#ff9f43', '#ff6b81', '#7bed9f', '#70a1ff', '#eccc68', '#a29bfe'];
      const me = { x: W / 2, y: H / 2, s: 14, alive: true, face: 1 };
      let t = 0, target = null, eaten = 0;
      const gone = new Set(), others = {}, cache = new Map();
      const npc = i => {
        if (cache.has(i)) return cache.get(i);
        const r = rng(seed + i * 104729), born = i * 0.35, left = r() < .5;
        const n = { i, born, dir: left ? 1 : -1, y: 20 + r() * (H - 40), sp: 40 + r() * 70, s: 6 + r() * r() * (26 + born * 0.9), col: COLORS[Math.floor(r() * 6)], x0: left ? -80 : W + 80 };
        cache.set(i, n);
        return n;
      };
      ctx.on(c, 'pointermove', e => { target = ctx.pos(e, c); });
      ctx.on(c, 'pointerdown', e => { target = ctx.pos(e, c); });
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'f') others[from] = d;
          if (d.t === 'ate') gone.add(d.i);
          if (d.t === 'left') delete others[from];
          if (d.t === 'bite' && d.who === room.me && me.alive) die('Another player ate you.');
        }));
        ctx.every(66, () => room.send({ t: 'f', x: me.x, y: me.y, s: me.s, alive: me.alive, face: me.face }));
      }
      const fish = (x, y, s, col, face, label) => {
        g.save(); g.translate(x, y); g.scale(face, 1);
        g.fillStyle = col;
        g.beginPath(); g.ellipse(0, 0, s * 1.3, s * .85, 0, 0, 7); g.fill();
        g.beginPath(); g.moveTo(-s * 1.1, 0); g.lineTo(-s * 2, -s * .7); g.lineTo(-s * 2, s * .7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(s * .6, -s * .2, s * .26, 0, 7); g.fill();
        g.fillStyle = '#000'; g.beginPath(); g.arc(s * .68, -s * .2, s * .13, 0, 7); g.fill();
        g.restore();
        if (label) { g.fillStyle = '#fff'; g.font = '13px Rubik'; g.textAlign = 'center'; g.fillText(label, x, y - s - 6); }
      };
      function die(why) {
        me.alive = false;
        const score = Math.floor(me.s), nb = ctx.score(score);
        ctx.message('You got eaten!', `${why} Final size ${score}, ${eaten} fish eaten.${nb ? ' New best!' : ''}`, room
          ? [{ label: 'Back to menu', fn: ctx.restart }]
          : [{ label: 'Play again', fn: () => play(null, Math.floor(Math.random() * 1e9)) }]);
      }
      ctx.loop(dt => {
        t += dt;
        if (me.alive) {
          const sp = 260;
          let dx = (ctx.keys.has('ArrowRight') || ctx.keys.has('d') ? 1 : 0) - (ctx.keys.has('ArrowLeft') || ctx.keys.has('a') ? 1 : 0);
          let dy = (ctx.keys.has('ArrowDown') || ctx.keys.has('s') ? 1 : 0) - (ctx.keys.has('ArrowUp') || ctx.keys.has('w') ? 1 : 0);
          if (dx || dy) { target = null; const l = Math.hypot(dx, dy); me.x += dx / l * sp * dt; me.y += dy / l * sp * dt; }
          else if (target) {
            const ax = target.x - me.x, ay = target.y - me.y, l = Math.hypot(ax, ay);
            if (l > 4) { const st = Math.min(l, sp * dt); me.x += ax / l * st; me.y += ay / l * st; dx = ax; }
          }
          if (dx) me.face = dx > 0 ? 1 : -1;
          me.x = clamp(me.x, 0, W); me.y = clamp(me.y, 0, H);
        }
        const sea = g.createLinearGradient(0, 0, 0, H);
        sea.addColorStop(0, '#1486c9'); sea.addColorStop(1, '#06305c');
        g.fillStyle = sea; g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffffff22';
        for (let i = 0; i < 24; i++) {
          const r = rng(i * 31 + 5);
          const bx = r() * W, sp = 20 + r() * 40;
          g.beginPath(); g.arc(bx + Math.sin(t + i) * 8, H - ((t * sp + r() * H) % H), 2 + r() * 4, 0, 7); g.fill();
        }
        const newest = Math.floor(t / 0.35);
        for (let i = Math.max(0, newest - 90); i <= newest; i++) {
          if (gone.has(i)) continue;
          const n = npc(i), x = n.x0 + n.dir * n.sp * (t - n.born);
          if (x < -120 || x > W + 120) continue;
          fish(x, n.y, n.s, n.col, n.dir);
          if (me.alive && Math.hypot(x - me.x, n.y - me.y) < (n.s + me.s) * .85) {
            if (me.s > n.s) {
              gone.add(i); eaten++; me.s = Math.sqrt(me.s * me.s + n.s * n.s * .25);
              if (room) room.send({ t: 'ate', i });
            } else die('A bigger fish got you.');
          }
        }
        for (const id in others) {
          const o = others[id];
          if (!o.alive) continue;
          fish(o.x, o.y, o.s, '#f5f6fa', o.face, (room.players.find(p => p.id === id) || {}).name);
          if (me.alive && me.s > o.s * 1.1 && Math.hypot(o.x - me.x, o.y - me.y) < me.s) {
            room.send({ t: 'bite', who: id }); me.s = Math.sqrt(me.s * me.s + o.s * o.s * .5); o.alive = false;
          }
        }
        if (me.alive) fish(me.x, me.y, me.s, '#ffd23f', me.face, ctx.user.name);
        hud.replaceChildren(el('span', {}, 'Size ', el('b', {}, Math.floor(me.s))), el('span', {}, 'Eaten ', el('b', {}, eaten)));
      });
    }
  },
});
