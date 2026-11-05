// Turbo Rally: 3D chase-camera racing with a garage. Coins from races buy upgrades.
App.register({
  id: 'race', name: 'Turbo Rally', icon: '🏎️', online: true,
  desc: 'Race 3D cars for three laps, earn coins, and upgrade in the garage.',
  fmtBest: b => b + 's',
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
    async function garage() {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const view = Gfx.stage(ctx, { ratio: 2.2, reserve: 380, top: '#1d2030', bottom: '#4a4f66', shadow: 8, near: .1, far: 200, fov: 38, sunDir: [.4, 1, .6] });
      const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), Gfx.mat(0x2b2e3c, { roughness: .35, metalness: .3 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; view.scene.add(floor);
      view.camera.position.set(0, 2.6, 8); view.camera.lookAt(0, .7, 0);
      let shown = null, paintShown = -1;
      const showCar = p => {
        if (p === paintShown) return;
        if (shown) view.scene.remove(shown);
        shown = Gfx.Models.car(new THREE.Color(PAINTS[p]).getHex()); view.scene.add(shown); paintShown = p;
      };
      ctx.loop(dt => { if (shown) shown.rotation.y += dt * .6; view.render(dt); });
      const panel = el('div', { class: 'panel', style: 'max-width:760px' });
      ctx.stage.append(panel);
      const draw = () => {
        const car = load();
        showCar(car.paint);
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

    async function race(room, seed) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const car = load(), LAPS = 3, N = 260, ROAD = 85, SCALE = 10;
      const hud = ctx.hud();
      const st = Gfx.stage(ctx, { top: '#3a9be8', bottom: '#e6f7ff', fog: [0xd4eefb, 900, 3200], shadow: 420, fov: 62, far: 5000, near: 2, reserve: 210 });
      const s = st.scene;
      const big = el('div', { class: 'cross', style: 'font:64px var(--pix);top:32%;color:#ffd23f' });
      st.wrap.append(big);
      ctx.help('Arrows or WASD to drive, Space for nitro, R to return to the road.');
      ctx.touch([['←', 'ArrowLeft'], ['→', 'ArrowRight'], ['▲', 'ArrowUp'], ['▼', 'ArrowDown'], ['🔥', ' ']]);
      const r = rng(seed), a1 = r() * 6.28, a2 = r() * 6.28, a3 = r() * 6.28;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const t = i / N * Math.PI * 2, R = 1150 * (1 + .28 * Math.sin(2 * t + a1) + .16 * Math.sin(3 * t + a2) + .07 * Math.sin(5 * t + a3));
        pts.push({ x: Math.cos(t) * R * 1.25, y: Math.sin(t) * R });
      }
      const heading = i => { const a = pts[i % N], b = pts[(i + 1) % N]; return Math.atan2(b.y - a.y, b.x - a.x); };

      const grass = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), Gfx.mat(0x4ea957, { roughness: 1 }));
      grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; s.add(grass);
      // Builds a strip that follows the track between two offsets from the center line.
      const ribbon = (from, to, y, color, stripe) => {
        const pos = [], col = [], c1 = new THREE.Color(color), c2 = new THREE.Color(stripe || color);
        const off = (i, d) => { const a = heading(i), p = pts[i % N]; return [p.x - Math.sin(a) * d, y, p.y + Math.cos(a) * d]; };
        for (let i = 0; i < N; i++) {
          const A = off(i, from), B = off(i, to), C = off(i + 1, to), D = off(i + 1, from), cc = i % 2 ? c1 : c2;
          pos.push(...A, ...D, ...C, ...A, ...C, ...B);
          for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, side: THREE.DoubleSide }));
        m.receiveShadow = true; s.add(m);
      };
      ribbon(-ROAD, ROAD, 1, 0x3b3e46);
      ribbon(ROAD, ROAD + 12, 1.5, 0xffffff, 0xe0322f);
      ribbon(-ROAD - 12, -ROAD, 1.5, 0xffffff, 0xe0322f);
      {
        const dashPos = [];
        for (let i = 0; i < N; i += 2) {
          const a = heading(i), p = pts[i], q = pts[(i + 1) % N], nx = -Math.sin(a) * 2.5, nz = Math.cos(a) * 2.5;
          dashPos.push(p.x - nx, 2, p.y - nz, q.x - nx, 2, q.y - nz, q.x + nx, 2, q.y + nz, p.x - nx, 2, p.y - nz, q.x + nx, 2, q.y + nz, p.x + nx, 2, p.y + nz);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(dashPos, 3));
        s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide })));
      }
      const a0 = heading(0), nx = -Math.sin(a0), ny = Math.cos(a0);
      {
        const c = el('canvas', { width: 16, height: 2 }), g = c.getContext('2d');
        for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i, j, 1, 1); }
        const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter;
        const line = new THREE.Mesh(new THREE.PlaneGeometry(40, ROAD * 2), new THREE.MeshBasicMaterial({ map: tx }));
        tx.rotation = Math.PI / 2; tx.center.set(.5, .5);
        line.rotation.set(-Math.PI / 2, 0, -a0); line.position.set(pts[0].x, 2.5, pts[0].y); s.add(line);
        const gm = Gfx.mat(0x25272e, { metalness: .6, roughness: .3 });
        const left = Gfx.box(10, 130, 10, gm, pts[0].x + nx * (ROAD + 20), 65, pts[0].y + ny * (ROAD + 20));
        const right = Gfx.box(10, 130, 10, gm, pts[0].x - nx * (ROAD + 20), 65, pts[0].y - ny * (ROAD + 20));
        const beam = Gfx.box(14, 28, ROAD * 2 + 50, Gfx.mat(0xffd23f, { emissive: 0x665000 }), pts[0].x, 130, pts[0].y);
        beam.rotation.y = -a0;
        s.add(left, right, beam);
      }
      // Scenery: instanced so hundreds of trees stay cheap to draw.
      {
        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(4, 6, 30, 7), Gfx.mat(0x6d4a2a), 260);
        const low = new THREE.InstancedMesh(new THREE.ConeGeometry(26, 44, 8), Gfx.mat(0x2f8f46), 260);
        const high = new THREE.InstancedMesh(new THREE.ConeGeometry(18, 38, 8), Gfx.mat(0x43b562), 260);
        const m4 = new THREE.Matrix4(), tr = rng(seed + 77);
        let n = 0, tries = 0;
        while (n < 260 && tries++ < 4000) {
          const base = pts[Math.floor(tr() * N)], x = base.x + (tr() - .5) * 900, z = base.y + (tr() - .5) * 900;
          let ok = true;
          for (let i = 0; i < N; i += 2) if (Math.hypot(pts[i].x - x, pts[i].y - z) < ROAD + 70) { ok = false; break; }
          if (!ok) continue;
          const h = .8 + tr() * .9;
          m4.makeScale(h, h, h); m4.setPosition(x, 15 * h, z); trunks.setMatrixAt(n, m4);
          m4.setPosition(x, 44 * h, z); low.setMatrixAt(n, m4);
          m4.setPosition(x, 70 * h, z); high.setMatrixAt(n, m4);
          n++;
        }
        for (const t of [trunks, low, high]) { t.count = n; t.castShadow = true; s.add(t); }
      }
      for (let i = 0; i < 10; i++) { const c = Gfx.Models.cloud(); c.scale.setScalar(70 + r() * 80); c.position.set((r() - .5) * 5000, 450 + r() * 300, (r() - .5) * 4000); s.add(c); }

      const slot = room ? room.players.findIndex(p => p.id === room.me) : 0;
      const me = { x: pts[0].x + nx * ((slot % 2) ? 28 : -28) - Math.cos(a0) * 40 * (slot >> 1), y: pts[0].y + ny * ((slot % 2) ? 28 : -28) - Math.sin(a0) * 40 * (slot >> 1), a: a0, v: 0, idx: 0, prog: 0, nitro: 60 + car.nitro * 40 };
      const MAX = 430 + car.engine * 55, ACC = 300 + car.engine * 45, TURN = 2.5 + car.tires * .25, GRASS = .42 + car.tires * .06;
      const power = car.engine + car.tires + car.nitro;
      const spawnCar = (col, name) => {
        const m = Gfx.Models.car(col); m.scale.setScalar(SCALE); s.add(m);
        if (name) { const l = Gfx.label(name); l.position.y = 2.6; l.scale.set(5, 1.1, 1); m.add(l); }
        return m;
      };
      const mine = spawnCar(new THREE.Color(PAINTS[car.paint]).getHex());
      const flame = Gfx.cone(4, 26, new THREE.MeshBasicMaterial({ color: 0xff8a1a }), -27, 7, 0, 8);
      flame.rotation.z = Math.PI / 2; flame.castShadow = false; flame.scale.setScalar(.1); flame.visible = false; s.add(flame);
      const bots = room ? [] : [.8, .88, .96].map((f, i) => ({ name: ['Rusty', 'Blaze', 'Viper'][i], f, off: (i - 1) * 30, prog: -(i + 1) * 1.2, x: 0, y: 0, a: a0, m: spawnCar([0x9aa0a6, 0xff9f43, 0x7bed9f][i], ['Rusty', 'Blaze', 'Viper'][i]) }));
      const others = {};
      const finished = [];
      let time = -3, done = false, camA = a0, lap = 0, count = 4;
      const engine = Sfx.engine();
      ctx.add(engine.stop);
      const total = LAPS * N;
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'c') {
            const o = others[from] || (others[from] = { m: spawnCar(new THREE.Color(d.col).getHex(), (room.players.find(p => p.id === from) || {}).name) });
            Object.assign(o, d);
          }
          if (d.t === 'fin' && !finished.includes(from)) finished.push(from);
          if (d.t === 'left' && others[from]) { s.remove(others[from].m); delete others[from]; }
        }));
        ctx.every(50, () => room.send({ t: 'c', x: me.x, y: me.y, a: me.a, p: me.prog, col: PAINTS[car.paint] }));
      }
      const ptAt = p => {
        const q = ((p % N) + N) % N, i = Math.floor(q), f = q - i, A = pts[i], B = pts[(i + 1) % N];
        return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, a: heading(i) };
      };
      ctx.cheat('🏁 Finish race in 1st', () => { if (!done) me.prog = total + 1; });
      ctx.cheat('🪙 +10,000 coins', () => { const c = load(); c.coins += 10000; ctx.save('car', c); });
      function finish() {
        done = true;
        for (const c of [0xffd23f, 0xff5d8f, 0x3fe0c5]) st.burst(mine.position.clone().setY(30), c, 30, 6, 170);
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
        let nitroOn = false, steer = 0, offRoad = false;
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
          const nowLap = Math.floor(me.prog / N);
          if (nowLap > lap) { lap = nowLap; if (lap < LAPS) { Sfx.play('upgrade'); st.flash('#ffffff'); } }
          const onRoad = best < ROAD;
          offRoad = !onRoad;
          const up = k.has('ArrowUp') || k.has('w'), dn = k.has('ArrowDown') || k.has('s');
          const lf = k.has('ArrowLeft') || k.has('a'), rt = k.has('ArrowRight') || k.has('d');
          nitroOn = k.has(' ') && me.nitro > 0 && up;
          if (nitroOn) me.nitro -= 40 * dt;
          const lim = (onRoad ? MAX : MAX * GRASS) * (nitroOn ? 1.4 : 1);
          if (up) me.v += ACC * (nitroOn ? 1.8 : 1) * dt;
          if (dn) me.v -= (me.v > 0 ? 650 : 200) * dt;
          if (!up && !dn) me.v -= Math.sign(me.v) * Math.min(Math.abs(me.v), 120 * dt);
          if (me.v > lim) me.v = Math.max(lim, me.v - 600 * dt);
          if (me.v < -140) me.v = -140;
          steer = (rt ? 1 : 0) - (lf ? 1 : 0);
          me.a += steer * TURN * dt * clamp(Math.abs(me.v) / 170, 0, 1) * Math.sign(me.v || 1);
          me.x += Math.cos(me.a) * me.v * dt; me.y += Math.sin(me.a) * me.v * dt;
          if (k.has('r')) { const p = pts[me.idx]; me.x = p.x; me.y = p.y; me.a = heading(me.idx); me.v = 0; }
          if (me.prog >= total) finish();
          for (const b of bots) {
            const speed = (360 + power * 28) * b.f;
            b.prog += speed * dt / (Math.PI * 2 * 1150 * 1.1 / N);
          }
        }
        const spin = m => m.userData.wheels.forEach(w => { w.children.forEach(c => { c.rotation.y += dt * 12; }); });
        for (const b of bots) {
          const p = ptAt(b.prog);
          b.x = p.x - Math.sin(p.a) * b.off; b.y = p.y + Math.cos(p.a) * b.off; b.a = p.a;
          b.m.position.set(b.x, 2, b.y); b.m.rotation.y = -b.a;
          if (go) spin(b.m);
        }
        for (const id in others) { const o = others[id]; o.m.position.set(o.x, 2, o.y); o.m.rotation.y = -o.a; }
        mine.position.set(me.x, 2 + (Math.abs(me.v) < 5 ? Math.sin(performance.now() * .05) * .22 : 0), me.y);
        mine.rotation.y = -me.a;
        mine.rotation.x = steer * clamp(me.v / MAX, 0, 1) * .06;
        mine.userData.wheels.slice(0, 2).forEach(w => { w.rotation.y = -steer * .4; });
        if (Math.abs(me.v) > 5) spin(mine);
        flame.visible = nitroOn;
        const fast = Math.abs(me.v);
        const tail = () => new THREE.Vector3(me.x - Math.cos(me.a) * 20, 5, me.y - Math.sin(me.a) * 20);
        if (go && offRoad && fast > 60) { if (Math.random() < .5) st.burst(tail(), 0xa5835a, 2, 6, 45); st.shake(fast * .006); }
        if (go && !offRoad && steer && fast > 300) { if (Math.random() < .5) st.burst(tail(), 0xcfcfcf, 1, 7, 28); Sfx.play('skid'); }
        if (nitroOn) { st.shake(1.5); Sfx.play('nitro'); st.burst(tail(), 0xffa02e, 1, 5, 60); }
        engine.set(55 + fast * .32, done || time < -3 ? 0 : .035 + fast * .00007);
        if (nitroOn) {
          flame.position.set(me.x - Math.cos(me.a) * 34, 9, me.y - Math.sin(me.a) * 34);
          flame.rotation.set(0, -me.a, Math.PI / 2);
          flame.scale.setScalar(.8 + Math.random() * .6);
        }
        let da = me.a - camA;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        camA += da * (1 - Math.exp(-5 * dt));
        const back = 125 + Math.abs(me.v) * .05;
        st.camera.position.set(me.x - Math.cos(camA) * back, 62, me.y - Math.sin(camA) * back);
        st.camera.lookAt(me.x + Math.cos(camA) * 70, 12, me.y + Math.sin(camA) * 70);
        const fov = 62 + clamp(me.v / MAX, 0, 1.4) * 10;
        if (Math.abs(st.camera.fov - fov) > .1) { st.camera.fov += (fov - st.camera.fov) * .1; st.camera.updateProjectionMatrix(); }
        st.follow(me.x, 0, me.y);
        const all = [{ p: me.prog }, ...bots.map(b => ({ p: b.prog })), ...Object.values(others).map(o => ({ p: o.p }))];
        const pos = 1 + all.filter(x => x.p > me.prog).length;
        hud.replaceChildren(el('span', {}, 'Lap ', el('b', {}, `${clamp(Math.floor(me.prog / N) + 1, 1, LAPS)}/${LAPS}`)), el('span', {}, 'Position ', el('b', {}, `${pos}/${all.length}`)),
          el('span', {}, 'Speed ', el('b', {}, Math.abs(Math.round(me.v / 3)))), el('span', {}, '🔥 ', el('b', {}, Math.max(0, Math.round(me.nitro)))), el('span', {}, '⏱ ', el('b', {}, Math.max(0, time).toFixed(1))));
        big.textContent = time < 0 ? Math.ceil(-time) : time < .8 ? 'GO!' : '';
        const shown = time < 0 ? Math.ceil(-time) : 0;
        if (shown < count) { count = shown; Sfx.play(shown ? 'beep' : 'go'); }
        st.render(dt);
      });
    }
  },
});
