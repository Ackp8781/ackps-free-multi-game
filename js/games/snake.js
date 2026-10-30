// Snake: the host (or the only player) runs the board; online clients just send turns.
App.register({
  id: 'snake', name: 'Snake & Apple', icon: '🍎', online: true,
  desc: 'Slither across a 3D garden. Solo, same keyboard, or online.',
  mount(ctx) {
    const W = 32, H = 22, COLS = [0x3fe0c5, 0xffd23f, 0xff5d8f, 0x8fa8ff, 0xb4f461, 0xff9f43, 0xe2a6ff, 0xffffff];
    ctx.lobby({ intro: 'Crash into a wall or another snake and you are out.', start: (room, seed) => play(room, seed, false),
      extra: [{ label: '2 players, same keyboard', fn: () => play(null, Math.floor(Math.random() * 1e9), true) }] });

    async function play(room, seed, local) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const hud = ctx.hud();
      const st = Gfx.stage(ctx, { ratio: 3 / 2, fov: 45, top: '#67c3f3', bottom: '#d9f5ff', shadow: 26, near: .1, far: 300, sunDir: [.45, 1, .4] });
      const scene = st.scene, c = st.canvas;
      st.camera.position.set(0, 31, 21);
      st.camera.lookAt(0, 0, 1.2);
      ctx.help(local ? 'Player 1: arrow keys. Player 2: WASD.' : 'Arrow keys or WASD. On a phone, swipe or use the buttons.');
      ctx.touch([['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']]);

      const tc = el('canvas', { width: W * 8, height: H * 8 }), tg = tc.getContext('2d');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { tg.fillStyle = (x + y) % 2 ? '#62c063' : '#55b35a'; tg.fillRect(x * 8, y * 8, 8, 8); }
      const tex = new THREE.CanvasTexture(tc); tex.magFilter = THREE.NearestFilter;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: .9 }));
      board.rotation.x = -Math.PI / 2; board.receiveShadow = true; scene.add(board);
      const wood = Gfx.mat(0x8a5c34);
      scene.add(Gfx.box(W + 2, 1, 1, wood, 0, .3, -H / 2 - .5), Gfx.box(W + 2, 1, 1, wood, 0, .3, H / 2 + .5), Gfx.box(1, 1, H, wood, -W / 2 - .5, .3, 0), Gfx.box(1, 1, H, wood, W / 2 + .5, .3, 0));
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), Gfx.mat(0x3e9c4c, { roughness: 1 }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.y = -.2; scene.add(lawn);
      const deco = rng(seed + 3);
      for (let i = 0; i < 30; i++) {
        const t = Gfx.Models.tree(), side = i % 2 ? 1 : -1;
        t.position.set(side * (W / 2 + 3 + deco() * 12), 0, (deco() - .5) * 46 - 8); t.scale.setScalar(.9 + deco()); scene.add(t);
      }
      const gx = x => x - W / 2 + .5, gz = y => y - H / 2 + .5;

      const players = room ? room.players : local ? [{ id: 'a', name: 'Player 1' }, { id: 'b', name: 'Player 2' }] : [{ id: 'a', name: ctx.user.name }];
      const r = rng(seed), isHost = !room || room.isHost;
      const myId = room ? room.me : 'a';
      const spawn = (p, i) => {
        const y = 3 + (i * 5) % (H - 6), left = i % 2 === 0, x = left ? 5 : W - 6, d = left ? [1, 0] : [-1, 0];
        return { id: p.id, name: p.name, col: i % 8, body: [[x, y], [x - d[0], y], [x - 2 * d[0], y]], d, next: d, alive: true, score: 0 };
      };
      let state = { snakes: players.map(spawn), apples: [] }, done = false;
      const free = () => {
        for (;;) {
          const a = [Math.floor(r() * W), Math.floor(r() * H)];
          if (!state.snakes.some(s => s.body.some(b => b[0] === a[0] && b[1] === a[1]))) return a;
        }
      };
      const appleCount = Math.max(2, players.length + 1);
      while (state.apples.length < appleCount) state.apples.push(free());

      const turn = (id, d) => {
        const s = state.snakes.find(x => x.id === id);
        if (s && !(s.d[0] === -d[0] && s.d[1] === -d[1])) s.next = d;
      };
      const send = d => (room && !room.isHost ? room.send({ t: 'turn', d }) : turn(myId, d));
      const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      ctx.on(window, 'keydown', e => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, d = DIRS[k];
        if (!d) return;
        if (local) turn(k.length === 1 ? 'b' : 'a', d); else send(d);
      });
      let sw = null;
      ctx.on(c, 'pointerdown', e => { sw = [e.clientX, e.clientY]; });
      ctx.on(c, 'pointerup', e => {
        if (!sw) return;
        const dx = e.clientX - sw[0], dy = e.clientY - sw[1];
        if (Math.hypot(dx, dy) > 20) send(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
      });
      if (room) ctx.add(room.onMessage((d, from) => {
        if (d.t === 'turn' && isHost) turn(from, d.d);
        if (d.t === 'left' && isHost) { const s = state.snakes.find(x => x.id === from); if (s) s.alive = false; }
        if (d.t === 'state' && !isHost) { state = d.s; draw(); if (d.s.over) finish(); }
      }));

      function step() {
        const live = state.snakes.filter(s => s.alive);
        const heads = live.map(s => { s.d = s.next; return [s.body[0][0] + s.d[0], s.body[0][1] + s.d[1]]; });
        live.forEach((s, i) => {
          const h = heads[i], ai = state.apples.findIndex(a => a[0] === h[0] && a[1] === h[1]);
          s.body.unshift(h);
          if (ai >= 0) { s.score++; state.apples[ai] = null; } else s.body.pop();
        });
        live.forEach((s, i) => {
          const [x, y] = heads[i];
          const hit = x < 0 || y < 0 || x >= W || y >= H || state.snakes.some(o => o.alive && o.body.some((b, n) => (o !== s || n > 0) && b[0] === x && b[1] === y));
          if (hit) s.dead = true;
        });
        live.forEach(s => { if (s.dead) { s.alive = false; delete s.dead; } });
        state.apples = state.apples.map(a => a || free());
        const left = state.snakes.filter(s => s.alive).length;
        state.over = players.length > 1 ? left <= 1 : left === 0;
        if (room) room.send({ t: 'state', s: state });
        draw();
        if (state.over) finish();
      }

      const apples = [], visuals = {};
      const segGeo = new THREE.SphereGeometry(.5, 18, 14);
      const visual = s => visuals[s.id] || (visuals[s.id] = (() => {
        const m = new THREE.MeshStandardMaterial({ color: COLS[s.col], roughness: .3, transparent: true });
        const alt = new THREE.MeshStandardMaterial({ color: new THREE.Color(COLS[s.col]).multiplyScalar(.78), roughness: .3, transparent: true });
        return { m, alt, segs: [], eyes: Gfx.group(Gfx.eye(.2, .2, .22, .15), Gfx.eye(.2, .2, -.22, .15)) };
      })());
      function draw() {
        while (apples.length < state.apples.length) { const a = Gfx.Models.apple(); a.scale.setScalar(.48); scene.add(a); apples.push(a); }
        state.apples.forEach((a, i) => {
          const m = apples[i], x = gx(a[0]), z = gz(a[1]);
          if (m.userData.x !== undefined && (m.userData.x !== x || m.userData.z !== z)) st.burst(new THREE.Vector3(m.userData.x, .6, m.userData.z), 0xff3b3b, 12, .16, 4);
          m.userData.x = x; m.userData.z = z;
        });
        for (const s of state.snakes) {
          const v = visual(s);
          while (v.segs.length < s.body.length) {
            const n = v.segs.length, last = v.segs[n - 1], b = s.body[n];
            const seg = new THREE.Mesh(segGeo, n % 2 ? v.alt : v.m);
            seg.castShadow = true;
            seg.position.copy(last ? last.position : new THREE.Vector3(gx(b[0]), .45, gz(b[1])));
            scene.add(seg); v.segs.push(seg);
            if (!n) { seg.add(v.eyes); seg.scale.setScalar(1.15); }
          }
          v.m.opacity = v.alt.opacity = s.alive ? 1 : .25;
          v.head = Math.atan2(-s.d[1], s.d[0]);
          v.target = s.body;
        }
        hud.replaceChildren(...state.snakes.map(s => el('span', { style: 'color:#' + COLS[s.col].toString(16).padStart(6, '0') }, `${s.name}: ${s.score}${s.alive ? '' : ' 💀'}`)));
      }
      function finish() {
        if (done) return;
        done = true;
        const mine = state.snakes.find(s => s.id === myId);
        const nb = !local && ctx.score(mine.score);
        const best = state.snakes.filter(s => s.alive)[0];
        const title = players.length === 1 ? 'Game over' : best ? `${best.name} wins!` : 'Draw!';
        ctx.message(title, `${mine.name}: ${mine.score} apples.${nb ? ' New best!' : ''}`, room
          ? [{ label: 'Back to menu', fn: ctx.restart }]
          : [{ label: 'Play again', fn: () => play(null, Math.floor(Math.random() * 1e9), local) }, { label: 'Menu', fn: ctx.restart }]);
      }
      draw();
      ctx.loop((dt, now) => {
        apples.forEach((m, i) => { m.position.set(m.userData.x, .55 + Math.sin(now * .004 + i) * .1, m.userData.z); m.rotation.y = now * .002; });
        const f = 1 - Math.exp(-28 * dt);
        for (const id in visuals) {
          const v = visuals[id];
          v.target.forEach((b, i) => {
            const seg = v.segs[i];
            if (!seg) return;
            seg.position.x += (gx(b[0]) - seg.position.x) * f; seg.position.z += (gz(b[1]) - seg.position.z) * f;
            seg.position.y = .45 + Math.sin(now * .012 - i * .7) * .04;
          });
          if (v.segs[0]) v.segs[0].rotation.y = v.head;
        }
        st.render(dt);
      });
      if (isHost) ctx.every(110, () => { if (!done) step(); });
    }
  },
});
