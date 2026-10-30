// Minesweeper, Flappy Wings and Fish Frenzy, all rendered in 3D.
App.register({
  id: 'mines', name: 'Minesweeper', icon: '💣', online: true,
  desc: 'A 3D minefield. Clear it solo or race friends on the same board.',
  fmtBest: b => b + 's',
  mount(ctx) {
    const LEVELS = { Easy: [9, 9, 10], Medium: [16, 16, 40], Hard: [24, 16, 80] };
    const COL = ['', '#6ec6ff', '#7ee081', '#ff8a80', '#c9a2ff', '#ffb74d', '#4dd0e1', '#fff', '#bbb'];
    const opts = lvl => ctx.lobby({ intro: `${lvl} board. Change the size with the buttons below.`,
      extra: Object.keys(LEVELS).filter(k => k !== lvl).map(k => ({ label: 'Switch to ' + k, fn: () => opts(k) })),
      start: (room, seed) => play(room, seed, lvl) });
    opts('Easy');

    async function play(room, seed, lvl) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
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
      const span = Math.max(W, H * 1.5);
      const st = Gfx.stage(ctx, { ratio: 3 / 2, top: '#1a1540', bottom: '#3d2f7d', shadow: span, sunDir: [.4, 1, .5], far: 400, near: .1, hemi: .8 });
      st.camera.position.set(0, span * .78, H * .62 + 1);
      st.camera.lookAt(0, 0, .3);
      st.scene.add(Gfx.box(W + 1.2, .6, H + 1.2, Gfx.mat(0x2a2358, { roughness: .4 }), 0, -.45, 0));
      const closed = Gfx.mat(0x7468dd, { roughness: .35 }), closedAlt = Gfx.mat(0x6a5ed0, { roughness: .35 }), openM = Gfx.mat(0x1d1944, { roughness: .8 }), geo = new THREE.BoxGeometry(.94, .4, .94);
      const nums = {};
      const numTex = n => nums[n] || (nums[n] = (() => {
        const c = el('canvas', { width: 64, height: 64 }), g = c.getContext('2d');
        g.fillStyle = COL[n]; g.font = '800 48px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 32, 34);
        return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
      })());
      const planeGeo = new THREE.PlaneGeometry(.8, .8);
      const tiles = cells.map((_, i) => {
        const x = i % W, y = (i - x) / W, m = Gfx.mesh(geo, (x + y) % 2 ? closed : closedAlt, x - W / 2 + .5, 0, y - H / 2 + .5);
        m.userData.i = i;
        st.scene.add(m);
        return m;
      });
      const extra = {};
      const fbtn = el('button', { class: 'btn alt small', onclick: () => { flagMode = !flagMode; fbtn.textContent = flagMode ? '🚩 Flag mode: on' : '🚩 Flag mode: off'; } }, '🚩 Flag mode: off');
      ctx.stage.append(fbtn);
      ctx.help('Click a tile to open it. Right-click (or flag mode) to place a flag.');
      const hit = e => { const o = st.pickObj(e, tiles); return o ? o.userData.i : null; };
      ctx.on(st.canvas, 'click', e => { const i = hit(e); if (i != null) (flagMode ? flag : open)(i); });
      ctx.on(st.canvas, 'contextmenu', e => { e.preventDefault(); const i = hit(e); if (i != null) flag(i); });

      const swap = (i, obj) => {
        if (extra[i]) st.scene.remove(extra[i]);
        extra[i] = obj;
        if (obj) { obj.position.x = tiles[i].position.x; obj.position.z = tiles[i].position.z; st.scene.add(obj); }
      };
      const draw = i => {
        const c = cells[i], t = tiles[i];
        if (c.open) {
          t.material = openM; t.position.y = -.2;
          if (c.mine) { const m = Gfx.Models.mine(); m.position.y = .35; swap(i, m); }
          else if (c.n) { const p = new THREE.Mesh(planeGeo, numTex(c.n)); p.rotation.x = -Math.PI / 2; p.position.y = .02; swap(i, p); st.pop(p); }
          else swap(i, null);
        } else if (c.flag) { const f = Gfx.Models.flag(); f.scale.setScalar(.32); f.position.y = .2; swap(i, f); }
        else swap(i, null);
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
      const flag = i => { if (!over && !cells[i].open) { cells[i].flag = !cells[i].flag; draw(i); Sfx.play('flag'); if (extra[i]) st.pop(extra[i]); } };
      function open(i) {
        if (over || cells[i].flag || cells[i].open) return;
        if (!placed) place(i);
        const stack = [i];
        while (stack.length) {
          const a = stack.pop(), c = cells[a];
          if (c.open || c.flag) continue;
          c.open = true; opened++; draw(a); Sfx.play('tick');
          if (c.mine) { const at = tiles[a].position.clone().setY(.5);
            st.burst(at, 0xff7a1a, 40, .22, 7); st.burst(at, 0x333333, 20, .3, 4); st.ring(at, 0xffc13b, 7); st.shake(1.2); st.flash('#ff7a1a'); Sfx.play('boom');
            return lose(); }
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
        st.burst(new THREE.Vector3(0, 2, 0), 0xffd23f, 60, .25, 10); st.burst(new THREE.Vector3(0, 2, 0), 0x3fe0c5, 40, .25, 8);
        end('You cleared it!', `${s} seconds.${ctx.score(s, true) ? ' New best!' : ''}`);
      }
      function lose() {
        cells.forEach((c, i) => { if (c.mine && !c.open) { c.open = true; draw(i); } });
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
      ctx.loop(dt => st.render(dt));
    }
  },
});

App.register({
  id: 'flappy', name: 'Flappy Wings', icon: '🐤', online: true,
  desc: 'Flap a 3D bird through the pipes while friends fly beside you.',
  mount(ctx) {
    ctx.lobby({ intro: 'Last bird flying wins.', start: play });
    async function play(room, seed) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const W = 480, H = 640, GAP = 165, SPACE = 230, SPEED = 170;
      const st = Gfx.stage(ctx, { ratio: W / H, fov: 48, top: '#2f9df0', bottom: '#d5f4ff', shadow: 500, center: [W / 2, 200, 0], sunDir: [.4, .9, .7] });
      const s = st.scene, canvas = st.canvas;
      st.camera.position.set(W / 2, H / 2 + 20, 740);
      st.camera.lookAt(W / 2, H / 2, 0);
      const scoreTag = el('div', { class: 'tag3d', style: 'left:50%;transform:translateX(-50%);font:28px var(--pix);top:20px' }, '0');
      st.wrap.append(scoreTag);
      ctx.help('Space, up arrow, click or tap to flap.');
      const gapAt = i => 110 + rng(seed + i * 7919)() * (H - 320);
      let y = H / 2, v = 0, dist = 0, alive = true, begun = !!room, score = 0, flapT = 0;
      const others = {};
      const ground = Gfx.box(4000, 50, 500, Gfx.mat(0x6ccf5b), W / 2, 25, 0);
      const dirt = Gfx.box(4000, 16, 500, Gfx.mat(0x9b6f3f), W / 2, -8, 0);
      s.add(ground, dirt);
      const hills = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const h = Gfx.ball(150, Gfx.mat(i % 2 ? 0x7fd486 : 0x69c575), 0, 40, -420, 1.4, .8, .6); h.castShadow = false; s.add(h); return h; });
      const clouds = [0, 1, 2, 3, 4].map(i => { const c = Gfx.Models.cloud(); c.scale.setScalar(38 + i * 6); c.position.set(i * 170, 460 + (i % 3) * 70, -280); s.add(c); return c; });
      const green = Gfx.mat(0x3fb54a, { roughness: .35 }), lip = Gfx.mat(0x2d9539, { roughness: .35 });
      const pipes = Array.from({ length: 6 }, () => {
        const g = new THREE.Group(), L = 700;
        const up = Gfx.cyl(31, 31, L, green, 0, L / 2 + GAP, 0), a = Gfx.cyl(36, 36, 24, lip, 0, GAP + 12, 0);
        const dn = Gfx.cyl(31, 31, L, green, 0, -L / 2, 0), b = Gfx.cyl(36, 36, 24, lip, 0, -12, 0);
        g.add(up, a, dn, b); s.add(g);
        return g;
      });
      const me = Gfx.Models.bird(); me.scale.setScalar(16); s.add(me);
      const flap = () => { if (alive) { begun = true; v = -400; flapT = .18; Sfx.play('flap'); st.burst(me.position, 0xfff3c4, 3, 3, 50); } };
      ctx.on(canvas, 'pointerdown', e => { e.preventDefault(); flap(); });
      ctx.on(window, 'keydown', e => { if ((e.key === ' ' || e.key === 'ArrowUp') && !e.repeat) flap(); });
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'b') {
            const o = others[from] || (others[from] = (() => {
              const b = Gfx.Models.bird(0x8fd6ff); b.scale.setScalar(15); Gfx.ghost(b, .55); s.add(b);
              const l = Gfx.label((room.players.find(p => p.id === from) || {}).name || 'Player'); l.position.set(0, 2.2, 0); b.add(l);
              return { b };
            })());
            o.b.position.set(110, H - d.y, -30); o.b.visible = d.alive;
          }
          if (d.t === 'left' && others[from]) { s.remove(others[from].b); delete others[from]; }
        }));
        ctx.every(66, () => room.send({ t: 'b', y, alive, score }));
      }
      const die = () => {
        alive = false;
        st.burst(me.position, 0xffd23f, 22, 7, 180); st.shake(18); st.flash('#ffffff'); Sfx.play('hit');
        const nb = ctx.score(score);
        if (room) room.send({ t: 'b', y, alive, score });
        ctx.message('Game over', `Score ${score}.${nb ? ' New best!' : ''}`, room
          ? [{ label: 'Back to menu', fn: ctx.restart }]
          : [{ label: 'Play again', fn: () => play(null, Math.floor(Math.random() * 1e9)) }]);
      };
      ctx.loop((dt, now) => {
        if (begun && alive) {
          v += 1250 * dt; y += v * dt; dist += SPEED * dt;
          const was = score;
          score = dist < 390 ? 0 : Math.floor((dist - 390) / SPACE) + 1;
          if (score > was) { Sfx.play('ding'); st.ring(me.position, 0xffffff, 40); st.burst(me.position, 0xffd23f, 6, 4, 90); }
          if (y > H - 50 || y < 0) die();
        } else if (!alive && y < H - 62) { v += 1250 * dt; y = Math.min(H - 62, y + v * dt); }
        const first = Math.max(0, Math.floor((dist - 110) / SPACE) - 2);
        pipes.forEach((p, n) => {
          const i = first + n, x = 500 + i * SPACE - dist, gy = gapAt(i);
          p.position.set(x + 31, H - gy - GAP, 0);
          if (alive && 110 + 15 > x && 110 - 15 < x + 62 && (y - 12 < gy || y + 12 > gy + GAP)) die();
        });
        hills.forEach((h, i) => { h.position.x = ((i * 300 - dist * .25) % 2400 + 2400) % 2400 - 700; });
        clouds.forEach((c, i) => { c.position.x = ((i * 280 - dist * .12 - now * .004) % 1500 + 1500) % 1500 - 500; });
        me.position.set(110, H - y, 0);
        me.rotation.z = alive ? clamp(-v / 600, -1, .5) : me.rotation.z - dt * 7;
        me.scale.set(16 * (1 - flapT * .9), 16 * (1 + flapT * 1.2), 16);
        flapT = Math.max(0, flapT - dt);
        const wing = (flapT > 0 ? Math.sin(flapT * 50) : Math.sin(now * .012) * .4) * .8;
        me.userData.wing.rotation.x = -wing; me.userData.wing2.rotation.x = wing;
        scoreTag.textContent = begun ? score : 'TAP TO START';
        st.render(dt);
      });
    }
  },
});

App.register({
  id: 'fish', name: 'Fish Frenzy', icon: '🐟', online: true,
  desc: 'Swim a 3D reef, eat smaller fish, and hunt your friends.',
  mount(ctx) {
    ctx.lobby({ intro: 'Eat anything smaller than you. Anything bigger eats you.', start: play });
    async function play(room, seed) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const W = 900, H = 540;
      const st = Gfx.stage(ctx, { ratio: W / H, fov: 42, top: '#16a3df', bottom: '#052d5c', fog: [0x0b5c94, 650, 1500], shadow: 600, center: [0, 0, 0], sunDir: [.2, 1, .3], skyLight: 0xbfefff, groundLight: 0x0a3a66, sunColor: 0xcff3ff, far: 3000 });
      const s = st.scene, hud = ctx.hud();
      st.camera.position.set(0, 0, H / 2 / Math.tan(21 * Math.PI / 180));
      ctx.help('Move with the mouse, a finger, WASD or the arrow keys.');
      const toX = x => x - W / 2, toY = y => H / 2 - y;
      const COLORS = [0xff9f43, 0xff6b81, 0x7bed9f, 0x70a1ff, 0xeccc68, 0xa29bfe];
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1400, 40, 20), Gfx.mat(0xd9c078, { roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, -H / 2 - 16, -300); floor.receiveShadow = true;
      const fr = rng(seed + 11), fp = floor.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) fp.setZ(i, fr() * 22);
      floor.geometry.computeVertexNormals();
      s.add(floor);
      const weeds = [];
      for (let i = 0; i < 46; i++) {
        const r = rng(seed + i * 41), x = (r() - .5) * 1500, z = -40 - r() * 520;
        if (i % 3 === 0) {
          const col = [0xff6f91, 0xffa94d, 0xc77dff][i % 3 === 0 ? i % 9 / 3 : 0];
          const c = Gfx.mesh(new THREE.IcosahedronGeometry(14 + r() * 26, 1), new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: .7 }), x, -H / 2 + 5, z);
          c.scale.y = 1.3 + r(); s.add(c);
        } else {
          const w = Gfx.cyl(3, 7, 90 + r() * 120, Gfx.mat(i % 2 ? 0x2fae6d : 0x1f9160), x, -H / 2 + 40, z, 6);
          w.userData.p = r() * 6; s.add(w); weeds.push(w);
        }
      }
      for (let i = 0; i < 5; i++) {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(90, 1100), new THREE.MeshBasicMaterial({ color: 0xcff3ff, transparent: true, opacity: .05, depthWrite: false }));
        ray.position.set(-500 + i * 240, 80, -320); ray.rotation.z = .22; s.add(ray);
      }
      const bubbles = Array.from({ length: 26 }, (_, i) => {
        const r = rng(i * 31 + 5);
        const b = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .32, roughness: .05 }));
        b.userData = { x: (r() - .5) * W, z: -r() * 180, sp: 22 + r() * 40, o: r() * H }; s.add(b);
        return b;
      });
      const mine = Gfx.Models.fish(0xffd23f); s.add(mine);
      const nameTag = Gfx.label(ctx.user.name); s.add(nameTag);
      const me = { x: W / 2, y: H / 2, s: 14, alive: true, face: 1 };
      let t = 0, target = null, eaten = 0, gulp = 0;
      const gone = new Set(), others = {}, cache = new Map(), live = new Map();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const npc = i => {
        if (cache.has(i)) return cache.get(i);
        const r = rng(seed + i * 104729), born = i * 0.35, left = r() < .5;
        const n = { i, born, dir: left ? 1 : -1, y: 20 + r() * (H - 40), sp: 40 + r() * 70, s: 6 + r() * r() * (26 + born * 0.9), col: COLORS[Math.floor(r() * 6)], x0: left ? -80 : W + 80 };
        cache.set(i, n);
        return n;
      };
      const drop = i => { const m = live.get(i); if (m) { s.remove(m); live.delete(i); } };
      const toTarget = e => { const p = st.pick(e, plane); if (p) target = { x: p.x + W / 2, y: H / 2 - p.y }; };
      ctx.on(st.canvas, 'pointermove', toTarget);
      ctx.on(st.canvas, 'pointerdown', toTarget);
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'f') {
            const o = others[from] || (others[from] = (() => {
              const m = Gfx.Models.fish(0xf5f6fa), l = Gfx.label((room.players.find(p => p.id === from) || {}).name || 'Player');
              s.add(m, l);
              return { m, l };
            })());
            Object.assign(o, d);
          }
          if (d.t === 'ate') { gone.add(d.i); drop(d.i); }
          if (d.t === 'left' && others[from]) { s.remove(others[from].m, others[from].l); delete others[from]; }
          if (d.t === 'bite' && d.who === room.me && me.alive) die('Another player ate you.');
        }));
        ctx.every(66, () => room.send({ t: 'f', x: me.x, y: me.y, s: me.s, alive: me.alive, face: me.face }));
      }
      const face = (m, dir, tt, sc) => {
        m.scale.setScalar(sc);
        m.rotation.y += ((dir > 0 ? -.3 : Math.PI + .3) - m.rotation.y) * .15;
        m.userData.tail.rotation.y = Math.sin(tt * 11) * .5;
      };
      function die(why) {
        me.alive = false; mine.visible = false; nameTag.visible = false;
        st.burst(new THREE.Vector3(toX(me.x), toY(me.y), 0), 0xffd23f, 26, 6, 170); st.shake(16); st.flash('#ff3b3b'); Sfx.play('hit');
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
          const dy = (ctx.keys.has('ArrowDown') || ctx.keys.has('s') ? 1 : 0) - (ctx.keys.has('ArrowUp') || ctx.keys.has('w') ? 1 : 0);
          if (dx || dy) { target = null; const l = Math.hypot(dx, dy); me.x += dx / l * sp * dt; me.y += dy / l * sp * dt; }
          else if (target) {
            const ax = target.x - me.x, ay = target.y - me.y, l = Math.hypot(ax, ay);
            if (l > 4) { const st2 = Math.min(l, sp * dt); me.x += ax / l * st2; me.y += ay / l * st2; dx = ax; }
          }
          if (dx) me.face = dx > 0 ? 1 : -1;
          me.x = clamp(me.x, 0, W); me.y = clamp(me.y, 0, H);
        }
        const newest = Math.floor(t / 0.35);
        for (const i of live.keys()) if (i < newest - 90) drop(i);
        for (let i = Math.max(0, newest - 90); i <= newest; i++) {
          if (gone.has(i)) continue;
          const n = npc(i), x = n.x0 + n.dir * n.sp * (t - n.born);
          if (x < -120 || x > W + 120) { drop(i); continue; }
          let m = live.get(i);
          if (!m) { m = Gfx.Models.fish(n.col); m.rotation.y = n.dir > 0 ? -.3 : Math.PI + .3; s.add(m); live.set(i, m); }
          m.position.set(toX(x), toY(n.y), 0);
          face(m, n.dir, t + i, n.s);
          if (me.alive && Math.hypot(x - me.x, n.y - me.y) < (n.s + me.s) * .85) {
            if (me.s > n.s) {
              gone.add(i); drop(i); eaten++; me.s = Math.sqrt(me.s * me.s + n.s * n.s * .25);
              st.burst(new THREE.Vector3(toX(x), toY(n.y), 0), n.col, 10, 4, 110); st.ring(new THREE.Vector3(toX(x), toY(n.y), 0), 0xffffff, n.s * 3); Sfx.play('eat'); gulp = 1;
              if (room) room.send({ t: 'ate', i });
            } else die('A bigger fish got you.');
          }
        }
        for (const id in others) {
          const o = others[id];
          o.m.visible = o.l.visible = !!o.alive && o.s > 0;
          if (!o.alive || !o.s) continue;
          o.m.position.set(toX(o.x), toY(o.y), 0);
          face(o.m, o.face, t, o.s);
          o.l.position.set(toX(o.x), toY(o.y) + o.s + 18, 0); o.l.scale.set(90, 20, 1);
          if (me.alive && me.s > o.s * 1.1 && Math.hypot(o.x - me.x, o.y - me.y) < me.s) {
            room.send({ t: 'bite', who: id }); me.s = Math.sqrt(me.s * me.s + o.s * o.s * .5); o.alive = false;
          }
        }
        if (me.alive) {
          mine.position.set(toX(me.x), toY(me.y), 0);
          gulp = Math.max(0, gulp - dt * 5);
          face(mine, me.face, t, me.s * (1 + gulp * .25));
          nameTag.position.set(toX(me.x), toY(me.y) + me.s + 18, 0); nameTag.scale.set(90, 20, 1);
        }
        for (const b of bubbles) { const u = b.userData; b.position.set(u.x + Math.sin(t + u.o) * 8, -H / 2 + (t * u.sp + u.o) % H, u.z); }
        for (const w of weeds) w.rotation.z = Math.sin(t * 1.2 + w.userData.p) * .09;
        hud.replaceChildren(el('span', {}, 'Size ', el('b', {}, Math.floor(me.s))), el('span', {}, 'Eaten ', el('b', {}, eaten)));
        st.render(dt);
      });
    }
  },
});
