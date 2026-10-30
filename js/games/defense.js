// Castle Defense: place and upgrade towers along a fixed path.
App.register({
  id: 'defense', name: 'Castle Defense', icon: '🏰', online: false,
  desc: 'Build towers, upgrade them, and survive every wave.',
  mount(ctx) {
    const T = 40, COLS = 22, ROWS = 13, W = COLS * T, H = ROWS * T;
    const WAY = [[-1, 2], [5, 2], [5, 9], [11, 9], [11, 3], [17, 3], [17, 10], [22, 10]];
    const TOWERS = {
      arrow: { name: 'Arrow', icon: '🏹', cost: 50, range: 120, rate: .5, dmg: 9, col: '#8fd16f' },
      cannon: { name: 'Cannon', icon: '💥', cost: 120, range: 110, rate: 1.3, dmg: 28, splash: 60, col: '#c58a4a' },
      frost: { name: 'Frost', icon: '❄️', cost: 90, range: 100, rate: .9, dmg: 4, slow: .5, col: '#7fd8ff' },
    };
    const road = new Set();
    for (let i = 0; i < WAY.length - 1; i++) {
      let [x, y] = WAY[i]; const [bx, by] = WAY[i + 1];
      while (x !== bx || y !== by) { road.add(x + ',' + y); x += Math.sign(bx - x); y += Math.sign(by - y); }
      road.add(bx + ',' + by);
    }
    const path = WAY.map(([x, y]) => ({ x: x * T + T / 2, y: y * T + T / 2 }));
    start();

    function start() {
      ctx.clear();
      const hud = ctx.hud(), c = ctx.canvas(W, H), g = c.getContext('2d');
      let gold = 200, lives = 20, wave = 0, queue = [], spawnT = 0, fast = 1, pick = 'arrow', sel = null, over = false, hover = null;
      const towers = [], foes = [], shots = [], blasts = [];
      const tools = el('div', { class: 'tools' });
      const info = el('div', { class: 'row', style: 'min-height:44px;align-items:center' });
      const nextBtn = el('button', { class: 'btn small', onclick: nextWave }, '▶ Next wave');
      const speedBtn = el('button', { class: 'btn alt small', onclick: () => { fast = fast === 1 ? 2 : 1; speedBtn.textContent = `Speed x${fast}`; } }, 'Speed x1');
      ctx.stage.append(tools, info);
      ctx.help('Pick a tower and click the grass to build. Click a built tower to upgrade or sell it.');

      const drawTools = () => {
        tools.replaceChildren(...Object.entries(TOWERS).map(([k, t]) => el('button', { class: 'btn alt small' + (pick === k ? ' on' : ''), style: pick === k ? 'outline:3px solid var(--acc)' : '', onclick: () => { pick = k; sel = null; drawTools(); drawInfo(); } }, `${t.icon} ${t.name} $${t.cost}`)), nextBtn, speedBtn);
      };
      const upCost = t => Math.round(TOWERS[t.k].cost * .8 * t.lv);
      const drawInfo = () => {
        info.replaceChildren();
        if (!sel) return;
        const full = sel.lv >= 4;
        info.append(el('span', {}, `${TOWERS[sel.k].icon} ${TOWERS[sel.k].name} level ${sel.lv}`),
          el('button', { class: 'btn small', disabled: full || gold < upCost(sel), onclick: () => { gold -= upCost(sel); sel.spent += upCost(sel); sel.lv++; drawInfo(); } }, full ? 'Max level' : `Upgrade $${upCost(sel)}`),
          el('button', { class: 'btn alt small', onclick: () => { gold += Math.round(sel.spent * .7); towers.splice(towers.indexOf(sel), 1); sel = null; drawInfo(); } }, 'Sell'));
      };
      drawTools();

      function nextWave() {
        if (queue.length || foes.length || over) return;
        wave++;
        const n = 6 + wave * 2, hp = 22 * Math.pow(1.22, wave);
        queue = [];
        for (let i = 0; i < n; i++) queue.push({ hp, sp: 60 + wave * 2 + (i % 4 === 3 ? 35 : 0), r: 11, gold: 4 + Math.floor(wave / 3), col: i % 4 === 3 ? '#ff9f43' : '#ff5d8f' });
        if (wave % 5 === 0) queue.push({ hp: hp * 12, sp: 40 + wave, r: 19, gold: 40 + wave * 3, col: '#a55eea', boss: 1 });
      }
      ctx.on(c, 'pointermove', e => { const p = ctx.pos(e, c); hover = { x: Math.floor(p.x / T), y: Math.floor(p.y / T) }; });
      ctx.on(c, 'pointerdown', e => {
        const p = ctx.pos(e, c), x = Math.floor(p.x / T), y = Math.floor(p.y / T);
        const hit = towers.find(t => t.x === x && t.y === y);
        if (hit) { sel = hit; drawInfo(); return; }
        sel = null; drawInfo();
        const d = TOWERS[pick];
        if (!road.has(x + ',' + y) && gold >= d.cost) { gold -= d.cost; towers.push({ k: pick, x, y, lv: 1, cd: 0, spent: d.cost }); }
      });
      const center = t => ({ x: t.x * T + T / 2, y: t.y * T + T / 2 });
      const stat = t => { const d = TOWERS[t.k], m = t.lv - 1; return { range: d.range * (1 + m * .12), rate: d.rate * Math.pow(.88, m), dmg: d.dmg * (1 + m * .75), splash: d.splash, slow: d.slow }; };

      function hurt(f, n) {
        f.hp -= n;
        if (f.hp <= 0 && !f.dead) { f.dead = true; gold += f.gold; if (sel) drawInfo(); }
      }
      function update(dt) {
        if (queue.length) {
          spawnT -= dt;
          if (spawnT <= 0) { spawnT = .7; foes.push({ ...queue.shift(), maxHp: 0, seg: 0, x: path[0].x, y: path[0].y, slow: 0 }); foes[foes.length - 1].maxHp = foes[foes.length - 1].hp; }
        }
        for (const f of foes) {
          f.slow = Math.max(0, f.slow - dt);
          let move = f.sp * (f.slow > 0 ? .5 : 1) * dt;
          while (move > 0 && f.seg < path.length - 1) {
            const b = path[f.seg + 1], dx = b.x - f.x, dy = b.y - f.y, l = Math.hypot(dx, dy);
            if (l <= move) { f.x = b.x; f.y = b.y; f.seg++; move -= l; } else { f.x += dx / l * move; f.y += dy / l * move; move = 0; }
          }
          if (f.seg >= path.length - 1 && !f.dead) { f.dead = true; lives -= f.boss ? 5 : 1; }
        }
        for (const t of towers) {
          t.cd -= dt;
          if (t.cd > 0) continue;
          const s = stat(t), p = center(t);
          let target = null;
          for (const f of foes) if (!f.dead && Math.hypot(f.x - p.x, f.y - p.y) <= s.range && (!target || f.seg > target.seg)) target = f;
          if (target) { t.cd = s.rate; shots.push({ x: p.x, y: p.y, f: target, s, col: TOWERS[t.k].col }); }
        }
        for (let i = shots.length - 1; i >= 0; i--) {
          const q = shots[i], dx = q.f.x - q.x, dy = q.f.y - q.y, l = Math.hypot(dx, dy), st = 480 * dt;
          if (l <= st) {
            if (q.s.splash) {
              blasts.push({ x: q.f.x, y: q.f.y, r: q.s.splash, t: .25 });
              for (const f of foes) if (!f.dead && Math.hypot(f.x - q.f.x, f.y - q.f.y) <= q.s.splash) hurt(f, q.s.dmg);
            } else if (!q.f.dead) hurt(q.f, q.s.dmg);
            if (q.s.slow) q.f.slow = 1.6;
            shots.splice(i, 1);
          } else { q.x += dx / l * st; q.y += dy / l * st; }
        }
        for (let i = blasts.length - 1; i >= 0; i--) if ((blasts[i].t -= dt) <= 0) blasts.splice(i, 1);
        for (let i = foes.length - 1; i >= 0; i--) if (foes[i].dead) foes.splice(i, 1);
        if (lives <= 0 && !over) {
          over = true;
          const nb = ctx.score(wave);
          ctx.message('The castle fell', `You reached wave ${wave}.${nb ? ' New best!' : ''}`, [{ label: 'Play again', fn: start }]);
        }
      }
      function draw() {
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
          g.fillStyle = road.has(x + ',' + y) ? '#c9a66b' : (x + y) % 2 ? '#4f9e4f' : '#55a855';
          g.fillRect(x * T, y * T, T, T);
        }
        g.font = '34px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('🏰', W - 22, 10 * T + T / 2);
        if (hover && !towers.some(t => t.x === hover.x && t.y === hover.y)) {
          const ok = !road.has(hover.x + ',' + hover.y) && gold >= TOWERS[pick].cost;
          g.fillStyle = ok ? '#ffffff44' : '#ff000044'; g.fillRect(hover.x * T, hover.y * T, T, T);
          g.strokeStyle = '#ffffff55'; g.beginPath(); g.arc(hover.x * T + T / 2, hover.y * T + T / 2, TOWERS[pick].range, 0, 7); g.stroke();
        }
        for (const t of towers) {
          const p = center(t), d = TOWERS[t.k];
          g.fillStyle = '#333'; g.fillRect(t.x * T + 3, t.y * T + 3, T - 6, T - 6);
          g.fillStyle = d.col; g.fillRect(t.x * T + 6, t.y * T + 6, T - 12, T - 12);
          g.font = '20px serif'; g.fillText(d.icon, p.x, p.y + 1);
          g.fillStyle = '#ffd23f';
          for (let i = 0; i < t.lv; i++) g.fillRect(t.x * T + 6 + i * 7, t.y * T + T - 9, 5, 4);
          if (t === sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, stat(t).range, 0, 7); g.stroke(); }
        }
        for (const f of foes) {
          g.fillStyle = f.slow > 0 ? '#7fd8ff' : f.col; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill();
          g.fillStyle = '#000'; g.fillRect(f.x - 14, f.y - f.r - 8, 28, 4);
          g.fillStyle = '#5f5'; g.fillRect(f.x - 14, f.y - f.r - 8, 28 * clamp(f.hp / f.maxHp, 0, 1), 4);
        }
        for (const q of shots) { g.fillStyle = q.col; g.beginPath(); g.arc(q.x, q.y, 4, 0, 7); g.fill(); }
        for (const b of blasts) { g.fillStyle = '#ffa50066'; g.beginPath(); g.arc(b.x, b.y, b.r * (1 - b.t / .3), 0, 7); g.fill(); }
      }
      ctx.loop(dt => {
        if (!over) update(dt * fast);
        draw();
        hud.replaceChildren(el('span', {}, '💰 ', el('b', {}, gold)), el('span', {}, '❤️ ', el('b', {}, Math.max(0, lives))), el('span', {}, 'Wave ', el('b', {}, wave)));
        nextBtn.disabled = over || queue.length > 0 || foes.length > 0;
      });
    }
  },
});
