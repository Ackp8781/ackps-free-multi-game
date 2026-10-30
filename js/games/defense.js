// Castle Defense: place and upgrade 3D towers along a fixed path.
App.register({
  id: 'defense', name: 'Castle Defense', icon: '🏰', online: false,
  desc: 'Build 3D towers, upgrade them, and survive every wave.',
  mount(ctx) {
    const T = 40, COLS = 22, ROWS = 13, W = COLS * T, H = ROWS * T;
    const WAY = [[-1, 2], [5, 2], [5, 9], [11, 9], [11, 3], [17, 3], [17, 10], [22, 10]];
    const TOWERS = {
      arrow: { name: 'Arrow', icon: '🏹', cost: 50, range: 120, rate: .5, dmg: 9, col: 0x8fd16f },
      cannon: { name: 'Cannon', icon: '💥', cost: 120, range: 110, rate: 1.3, dmg: 28, splash: 60, col: 0x3a3a3a },
      frost: { name: 'Frost', icon: '❄️', cost: 90, range: 100, rate: .9, dmg: 4, slow: .5, col: 0x7fd8ff },
    };
    const road = new Set();
    for (let i = 0; i < WAY.length - 1; i++) {
      let [x, y] = WAY[i]; const [bx, by] = WAY[i + 1];
      while (x !== bx || y !== by) { road.add(x + ',' + y); x += Math.sign(bx - x); y += Math.sign(by - y); }
      road.add(bx + ',' + by);
    }
    const path = WAY.map(([x, y]) => ({ x: x * T + T / 2, y: y * T + T / 2 }));
    start();

    async function start() {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const hud = ctx.hud();
      const st = Gfx.stage(ctx, { ratio: 16 / 10, fov: 42, reserve: 270, top: '#58b7ef', bottom: '#cfefff', shadow: 620, center: [W / 2, 0, H / 2], sunDir: [.55, 1, .4], far: 4000 });
      const s = st.scene, c = st.canvas;
      st.camera.position.set(W / 2, 640, H + 330);
      st.camera.lookAt(W / 2, 0, H / 2 + 30);
      const tc = el('canvas', { width: COLS * 16, height: ROWS * 16 }), tg = tc.getContext('2d'), nr = rng(4);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const isRoad = road.has(x + ',' + y);
        tg.fillStyle = isRoad ? '#c9a66b' : (x + y) % 2 ? '#559f50' : '#5cab57';
        tg.fillRect(x * 16, y * 16, 16, 16);
        for (let i = 0; i < 14; i++) { tg.fillStyle = isRoad ? '#b5935a' : '#4a8f47'; tg.fillRect(x * 16 + nr() * 15, y * 16 + nr() * 15, 2, 2); }
      }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(tc), roughness: 1 }));
      board.rotation.x = -Math.PI / 2; board.position.set(W / 2, 0, H / 2); board.receiveShadow = true; s.add(board);
      s.add(Gfx.box(W + 30, 30, H + 30, Gfx.mat(0x6b4d2e), W / 2, -16, H / 2));
      const castle = Gfx.Models.castle(); castle.scale.setScalar(13); castle.rotation.y = -Math.PI / 2; castle.position.set(W - 6, 0, 10 * T + T / 2); s.add(castle);
      const dr = rng(8);
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(dr() * COLS), y = i % 2 ? 0 : ROWS - 1;
        if (road.has(x + ',' + y)) continue;
        const t = Gfx.Models.tree(); t.scale.setScalar(7 + dr() * 3); t.position.set(x * T + T / 2, 0, y < 1 ? -34 : H + 34); s.add(t);
      }
      const hoverTile = new THREE.Mesh(new THREE.PlaneGeometry(T, T), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .3, depthWrite: false }));
      hoverTile.rotation.x = -Math.PI / 2; hoverTile.visible = false; s.add(hoverTile);
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, side: THREE.DoubleSide }));
      ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 2; ringMesh.visible = false; s.add(ringMesh);
      const shotGeo = new THREE.SphereGeometry(4, 10, 8);
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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
      const center = t => ({ x: t.x * T + T / 2, y: t.y * T + T / 2 });
      const model = t => {
        if (t.m) s.remove(t.m);
        const p = center(t);
        t.m = Gfx.Models.tower(t.k, t.lv); t.m.scale.setScalar(15); t.m.position.set(p.x, 0, p.y); s.add(t.m);
      };
      const drawInfo = () => {
        info.replaceChildren();
        if (!sel) return;
        const full = sel.lv >= 4;
        info.append(el('span', {}, `${TOWERS[sel.k].icon} ${TOWERS[sel.k].name} level ${sel.lv}`),
          el('button', { class: 'btn small', disabled: full || gold < upCost(sel), onclick: () => {
            gold -= upCost(sel); sel.spent += upCost(sel); sel.lv++; model(sel); drawInfo();
            const p = center(sel); st.burst(new THREE.Vector3(p.x, 40, p.y), 0xffd23f, 14, 4, 90);
          } }, full ? 'Max level' : `Upgrade $${upCost(sel)}`),
          el('button', { class: 'btn alt small', onclick: () => { gold += Math.round(sel.spent * .7); s.remove(sel.m); towers.splice(towers.indexOf(sel), 1); sel = null; drawInfo(); } }, 'Sell'));
      };
      drawTools();

      function nextWave() {
        if (queue.length || foes.length || over) return;
        wave++;
        const n = 6 + wave * 2, hp = 22 * Math.pow(1.22, wave);
        queue = [];
        for (let i = 0; i < n; i++) queue.push({ hp, sp: 60 + wave * 2 + (i % 4 === 3 ? 35 : 0), r: 11, gold: 4 + Math.floor(wave / 3), col: i % 4 === 3 ? 0xff9f43 : 0xff5d8f });
        if (wave % 5 === 0) queue.push({ hp: hp * 12, sp: 40 + wave, r: 19, gold: 40 + wave * 3, col: 0xa55eea, boss: 1 });
      }
      const tileOf = e => { const p = st.pick(e, ground); return p ? { x: Math.floor(p.x / T), y: Math.floor(p.z / T) } : null; };
      const inside = q => q && q.x >= 0 && q.y >= 0 && q.x < COLS && q.y < ROWS;
      ctx.on(c, 'pointermove', e => { hover = tileOf(e); });
      ctx.on(c, 'pointerdown', e => {
        const q = tileOf(e);
        if (!inside(q)) return;
        const hit = towers.find(t => t.x === q.x && t.y === q.y);
        if (hit) { sel = hit; drawInfo(); return; }
        sel = null; drawInfo();
        const d = TOWERS[pick];
        if (!road.has(q.x + ',' + q.y) && gold >= d.cost) {
          gold -= d.cost;
          const t = { k: pick, x: q.x, y: q.y, lv: 1, cd: 0, spent: d.cost };
          model(t); towers.push(t);
        }
      });
      const stat = t => { const d = TOWERS[t.k], m = t.lv - 1; return { range: d.range * (1 + m * .12), rate: d.rate * Math.pow(.88, m), dmg: d.dmg * (1 + m * .75), splash: d.splash, slow: d.slow }; };

      function hurt(f, n) {
        f.hp -= n;
        if (f.hp <= 0 && !f.dead) {
          f.dead = true; gold += f.gold; if (sel) drawInfo();
          st.burst(new THREE.Vector3(f.x, 16, f.y), f.col, f.boss ? 30 : 10, 4, 100);
        }
      }
      function update(dt) {
        if (queue.length) {
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = .7;
            const q = queue.shift(), m = Gfx.Models.foe(q.col, q.boss);
            m.scale.setScalar(q.r); s.add(m);
            const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000 })), bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x55ff55 }));
            barBg.scale.set(28, 4, 1); bar.scale.set(28, 4, 1); bar.renderOrder = 1; s.add(barBg, bar);
            foes.push({ ...q, maxHp: q.hp, seg: 0, x: path[0].x, y: path[0].y, slow: 0, m, bar, barBg, t: Math.random() * 6 });
          }
        }
        for (const f of foes) {
          f.slow = Math.max(0, f.slow - dt); f.t += dt * 9;
          let move = f.sp * (f.slow > 0 ? .5 : 1) * dt;
          while (move > 0 && f.seg < path.length - 1) {
            const b = path[f.seg + 1], dx = b.x - f.x, dy = b.y - f.y, l = Math.hypot(dx, dy);
            f.m.rotation.y = -Math.atan2(dy, dx);
            if (l <= move) { f.x = b.x; f.y = b.y; f.seg++; move -= l; } else { f.x += dx / l * move; f.y += dy / l * move; move = 0; }
          }
          if (f.seg >= path.length - 1 && !f.dead) { f.dead = true; lives -= f.boss ? 5 : 1; st.burst(new THREE.Vector3(W - 30, 60, f.y), 0xff4040, 14, 5, 120); }
        }
        for (const t of towers) {
          t.cd -= dt;
          const s2 = stat(t), p = center(t);
          let target = null;
          for (const f of foes) if (!f.dead && Math.hypot(f.x - p.x, f.y - p.y) <= s2.range && (!target || f.seg > target.seg)) target = f;
          if (target && t.k !== 'frost') t.m.userData.head.rotation.y = -Math.atan2(target.y - p.y, target.x - p.x);
          if (t.k === 'frost') t.m.userData.head.rotation.y += dt * 2;
          if (t.cd > 0 || !target) continue;
          t.cd = s2.rate;
          const m = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: TOWERS[t.k].col }));
          const y0 = 15 * (1 + t.lv * .45 + .9);
          m.position.set(p.x, y0, p.y); s.add(m);
          shots.push({ x: p.x, y: p.y, h: y0, f: target, s: s2, m });
        }
        for (let i = shots.length - 1; i >= 0; i--) {
          const q = shots[i], dx = q.f.x - q.x, dy = q.f.y - q.y, l = Math.hypot(dx, dy), step = 480 * dt;
          if (l <= step) {
            if (q.s.splash) {
              const b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: .55, depthWrite: false }));
              b.position.set(q.f.x, 10, q.f.y); s.add(b);
              blasts.push({ m: b, r: q.s.splash, t: .28 });
              for (const f of foes) if (!f.dead && Math.hypot(f.x - q.f.x, f.y - q.f.y) <= q.s.splash) hurt(f, q.s.dmg);
            } else if (!q.f.dead) hurt(q.f, q.s.dmg);
            if (q.s.slow) q.f.slow = 1.6;
            s.remove(q.m); shots.splice(i, 1);
          } else {
            q.x += dx / l * step; q.y += dy / l * step; q.h += (16 - q.h) * Math.min(1, step / Math.max(l, 1));
            q.m.position.set(q.x, q.h, q.y);
          }
        }
        for (let i = blasts.length - 1; i >= 0; i--) {
          const b = blasts[i];
          b.t -= dt; b.m.scale.setScalar(b.r * (1 - b.t / .34)); b.m.material.opacity = Math.max(0, b.t * 2);
          if (b.t <= 0) { s.remove(b.m); blasts.splice(i, 1); }
        }
        for (let i = foes.length - 1; i >= 0; i--) if (foes[i].dead) { const f = foes[i]; s.remove(f.m, f.bar, f.barBg); foes.splice(i, 1); }
        if (lives <= 0 && !over) {
          over = true;
          const nb = ctx.score(wave);
          ctx.message('The castle fell', `You reached wave ${wave}.${nb ? ' New best!' : ''}`, [{ label: 'Play again', fn: start }]);
        }
      }
      ctx.loop(dt => {
        if (!over) update(dt * fast);
        for (const f of foes) {
          f.m.position.set(f.x, Math.abs(Math.sin(f.t)) * 4, f.y);
          const top = f.r * (f.boss ? 3.1 : 2.6), w = 28 * clamp(f.hp / f.maxHp, 0, 1);
          f.barBg.position.set(f.x, top, f.y);
          f.bar.position.set(f.x - (28 - w) / 2, top, f.y); f.bar.scale.x = Math.max(.01, w);
          f.bar.material.color.setHex(f.slow > 0 ? 0x7fd8ff : 0x55ff55);
        }
        const showHover = inside(hover) && !towers.some(t => t.x === hover.x && t.y === hover.y);
        hoverTile.visible = showHover;
        if (showHover) {
          hoverTile.position.set(hover.x * T + T / 2, 1, hover.y * T + T / 2);
          hoverTile.material.color.setHex(!road.has(hover.x + ',' + hover.y) && gold >= TOWERS[pick].cost ? 0xffffff : 0xff3030);
        }
        const ring = sel ? { ...center(sel), r: stat(sel).range } : showHover ? { x: hover.x * T + T / 2, y: hover.y * T + T / 2, r: TOWERS[pick].range } : null;
        ringMesh.visible = !!ring;
        if (ring) { ringMesh.position.x = ring.x; ringMesh.position.z = ring.y; ringMesh.scale.set(ring.r, ring.r, 1); }
        st.render(dt);
        hud.replaceChildren(el('span', {}, '💰 ', el('b', {}, gold)), el('span', {}, '❤️ ', el('b', {}, Math.max(0, lives))), el('span', {}, 'Wave ', el('b', {}, wave)));
        nextBtn.disabled = over || queue.length > 0 || foes.length > 0;
      });
    }
  },
});
