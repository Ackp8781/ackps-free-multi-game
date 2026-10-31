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
      ctx.loop((dt, now) => {
        // Idle: a slow wave rolls over the unopened tiles and the camera drifts.
        tiles.forEach((t, i) => { if (!cells[i].open) t.position.y = Math.sin(now * .002 + i % W * .5 + i / W * .5) * .035; });
        st.camera.position.x = Math.sin(now * .0004) * .35;
        st.camera.lookAt(0, 0, .3);
        st.render(dt);
      });
    }
  },
});

App.register({
  id: 'flappy', name: 'Flappy Wings', icon: '🐤', online: true,
  desc: 'Tap to flap through the pipes in this one-button 2D pixel classic.',
  mount(ctx) {
    ctx.lobby({ intro: 'Last bird flying wins.', start: play });
    function play(room, seed) {
      ctx.clear();
      // The game runs on a small pixel grid that the browser scales up without smoothing.
      const W = 288, H = 512, FLOOR = 400, GAP = 100, SPACE = 156, PIPE = 52, SPEED = 120, GRAVITY = 1320, FLAP = -320, BIRD_X = 70;
      const c = ctx.canvas(W, H), g = c.getContext('2d');
      c.style.cssText = 'height:min(calc(100vh - 170px),160vw);aspect-ratio:9/16;image-rendering:pixelated;cursor:pointer';
      ctx.help('Space, up arrow, click or tap to flap.');
      const SOUND = {
        wing: { t: [[340, 620, .08, 'triangle', .14]], n: [[.06, .05, 2400]] },
        point: { t: [[880, 880, .07, 'square', .07], [1320, 1320, .16, 'square', .06, .07]] },
        hit: { n: [[.1, .3, 1800]], t: [[220, 70, .12, 'square', .14]] },
        die: { t: [[560, 110, .42, 'triangle', .16, .08]] },
        swoosh: { n: [[.2, .08, 3400]] },
      };
      const COLORS = { K: '#3a2333', B: '#f0668a', D: '#c9406a', L: '#ffd9c2', W: '#ffffff', E: '#3a2333', O: '#7fd13b', C: '#ffcf3f' };
      const BODY = ['.......CC........', '......CCKKKKK....', '....KKKBBBKWWK...', '...KBBBBBKWWEWK..', '..KBBBBBBKWWEWK..', '.KBBBBBBBBKWWWKKK', '.KBBBBBBBBBKKOOOK', '.KLBBBBBBBKOOOOKK', '..KLLBBBBBBKKKK..', '...KLLLLLBBBK....', '....KKLLLLKK.....', '......KKKK.......'];
      const WINGS = [['KKKK', 'KBBBK', 'KDDK'], ['KKKKK', 'KBBBK', '.KKK'], ['KDDK', 'KBBBK', 'KKKK']];
      const sprite = (rows, w, h, x = 0, y = 0, base = null) => {
        const s = el('canvas', { width: w, height: h }), q = s.getContext('2d');
        if (base) q.drawImage(base, 0, 0);
        rows.forEach((r, j) => [...r].forEach((p, i) => { if (COLORS[p]) { q.fillStyle = COLORS[p]; q.fillRect(x + i, y + j, 1, 1); } }));
        return s;
      };
      const body = sprite(BODY, 17, 12), frames = WINGS.map(w => sprite(w, 17, 12, 2, 4, body));
      const night = rng(seed)() < .35;
      const gapAt = i => 50 + rng(seed + i * 7919)() * (FLOOR - GAP - 100);
      const others = {};
      let state = room ? 'play' : 'ready', y = 230, v = 0, dist = 0, score = 0, t = 0, deadT = 0, flash = 0, shake = 0, best = 0, panelY = H, medal = null, fallen = false;
      const flap = () => {
        if (state === 'ready') state = 'play';
        if (state === 'play') { v = FLAP; Sfx.fx(SOUND.wing); }
        else if (state === 'dead' && deadT > 1) {
          Sfx.fx(SOUND.swoosh);
          if (room) ctx.restart(); else play(null, Math.floor(Math.random() * 1e9));
        }
      };
      ctx.on(c, 'pointerdown', e => { e.preventDefault(); flap(); });
      ctx.on(window, 'keydown', e => { if ((e.key === ' ' || e.key === 'ArrowUp') && !e.repeat) flap(); });
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'b') others[from] = { y: d.y, alive: d.alive, name: (room.players.find(p => p.id === from) || {}).name || 'Player' };
          if (d.t === 'left') delete others[from];
        }));
        ctx.every(66, () => room.send({ t: 'b', y, alive: state === 'play', score }));
      }
      const die = () => {
        state = 'dead';
        flash = 1; shake = 6; v = Math.max(v, 0);
        Sfx.fx(SOUND.hit); Sfx.fx(SOUND.die);
        ctx.score(score);
        best = ctx.best() || score;
        medal = score >= 40 ? '#e8f2ff' : score >= 30 ? '#ffd23f' : score >= 20 ? '#c9ced6' : score >= 10 ? '#c9803f' : null;
        if (room) room.send({ t: 'b', y, alive: false, score });
      };
      const step = dt => {
        t += dt;
        if (state === 'play') {
          dist += SPEED * dt;
          v = Math.min(v + GRAVITY * dt, 480); y += v * dt;
          const s = dist < 296 ? 0 : Math.floor((dist - 296) / SPACE) + 1;
          if (s > score) { score = s; Sfx.fx(SOUND.point); }
          if (y + 9 >= FLOOR) { y = FLOOR - 9; die(); return; }
          if (y < -30) y = -30;
          const first = Math.max(0, Math.floor((dist - 340) / SPACE) - 1);
          for (let i = first; i < first + 4; i++) {
            const x = 340 + i * SPACE - dist, top = gapAt(i);
            if (BIRD_X + 10 > x && BIRD_X - 10 < x + PIPE && (y - 8 < top || y + 8 > top + GAP)) { die(); return; }
          }
        } else if (state === 'dead') {
          deadT += dt;
          if (!fallen) { v = Math.min(v + GRAVITY * dt, 480); y += v * dt; if (y + 9 >= FLOOR) { y = FLOOR - 9; fallen = true; } }
          if (deadT > .6) panelY += (150 - panelY) * Math.min(1, dt * 9);
        }
      };
      const text = (s, x, yy, size = 16, color = '#fff', align = 'center') => {
        g.font = `${size}px 'Press Start 2P',monospace`; g.textAlign = align;
        g.fillStyle = '#3a2333'; g.fillText(s, x + 2, yy + 2);
        g.fillStyle = color; g.fillText(s, x, yy);
      };
      const rect = (col, x, yy, w, h) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(yy), w, h); };
      const pipe = (x, top) => {
        const piece = (yy, h, capY) => {
          rect('#3a2333', x + 2, yy, PIPE - 4, h);
          rect('#58b368', x + 3, yy, PIPE - 6, h); rect('#8fdc8f', x + 7, yy, 6, h); rect('#37894b', x + PIPE - 13, yy, 10, h);
          rect('#3a2333', x, capY, PIPE, 24);
          rect('#58b368', x + 1, capY + 1, PIPE - 2, 22); rect('#8fdc8f', x + 5, capY + 1, 6, 22); rect('#37894b', x + PIPE - 11, capY + 1, 10, 22);
        };
        piece(0, top, top - 24);
        piece(top + GAP, FLOOR - top - GAP, top + GAP);
      };
      const bird = (yy, angle, frame, alpha = 1) => {
        g.save(); g.globalAlpha = alpha; g.translate(BIRD_X, Math.round(yy)); g.rotate(angle); g.scale(1.4, 1.4);
        g.drawImage(frames[frame], -8.5, -6); g.restore();
      };
      const draw = () => {
        g.imageSmoothingEnabled = false;
        g.save();
        if (shake > .2) g.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
        const sky = g.createLinearGradient(0, 0, 0, FLOOR);
        sky.addColorStop(0, night ? '#14304f' : '#6fc9dc'); sky.addColorStop(1, night ? '#2f6a7f' : '#c9eee4');
        g.fillStyle = sky; g.fillRect(-8, -8, W + 16, H);
        const scroll = (speed, width) => -((dist * speed) % width);
        // Clouds, far hills and near treetops drift at different speeds.
        for (let i = 0; i < 6; i++) { const x = scroll(.1, 96) + i * 96; g.fillStyle = night ? '#2c5674' : '#eefaf6'; for (const [a, b, w, h] of [[0, 300, 40, 24], [20, 288, 44, 36], [52, 304, 36, 20]]) g.fillRect(x + a, b, w, h); }
        for (let i = 0; i < 7; i++) { const x = scroll(.25, 64) + i * 64; g.fillStyle = night ? '#1f4a57' : '#9edcb0'; g.fillRect(x, 340, 64, 60); g.fillRect(x + 12, 326, 32, 14); g.fillRect(x + 20, 318, 14, 8); }
        for (let i = 0; i < 12; i++) { const x = scroll(.5, 32) + i * 32; g.fillStyle = night ? '#173a44' : '#74c68c'; g.fillRect(x, 372, 32, 28); g.fillRect(x + 6, 362, 20, 10); }
        const first = Math.max(0, Math.floor((dist - 340) / SPACE) - 1);
        for (let i = first; i < first + 4; i++) pipe(Math.round(340 + i * SPACE - dist), gapAt(i));
        // The striped ground keeps moving with the pipes.
        rect('#3a2333', 0, FLOOR, W, 2); rect('#a4e05a', 0, FLOOR + 2, W, 12); rect('#e3d49a', 0, FLOOR + 14, W, H - FLOOR);
        for (let x = -((state === 'dead' ? dist : state === 'ready' ? t * SPEED : dist) % 20) - 20; x < W + 20; x += 20) { g.fillStyle = '#6fb53d'; g.beginPath(); g.moveTo(x, FLOOR + 14); g.lineTo(x + 10, FLOOR + 14); g.lineTo(x + 16, FLOOR + 2); g.lineTo(x + 6, FLOOR + 2); g.fill(); }
        rect('#c9b87c', 0, FLOOR + 14, W, 2);
        for (const id in others) if (others[id].alive) bird(others[id].y, 0, Math.floor(t * 10) % 3, .5);
        const hover = state === 'ready' ? Math.sin(t * 7) * 5 : 0;
        const angle = state === 'ready' ? 0 : clamp(v / 480 * 2.4 - .5, -.45, 1.57);
        bird(y + hover, angle, state === 'dead' || v > 300 ? 1 : Math.floor(t * 12) % 3);
        if (state !== 'dead' && state !== 'ready') text(String(score), W / 2, 70, 24);
        if (state === 'ready') {
          text('GET READY', W / 2, 130, 20, '#ffcf3f');
          text('TAP TO FLAP', W / 2, 310, 12);
        }
        if (state === 'dead') {
          if (deadT > .35) text('GAME OVER', W / 2, 120, 22, '#ff8a5c');
          const py = panelY;
          rect('#3a2333', 28, py, W - 56, 118); rect('#f4e6b8', 30, py + 2, W - 60, 114); rect('#d9c58a', 34, py + 6, W - 68, 106); rect('#f4e6b8', 36, py + 8, W - 72, 102);
          text('MEDAL', 76, py + 28, 10, '#c9803f'); text('SCORE', 244, py + 28, 10, '#c9803f', 'right'); text('BEST', 244, py + 74, 10, '#c9803f', 'right');
          text(String(score), 244, py + 50, 14, '#fff', 'right'); text(String(best), 244, py + 96, 14, '#fff', 'right');
          g.fillStyle = medal || '#d9c58a'; g.beginPath(); g.arc(76, py + 66, 22, 0, 7); g.fill();
          if (medal) { g.fillStyle = '#3a2333'; g.beginPath(); g.moveTo(76, py + 52); g.lineTo(80, py + 62); g.lineTo(90, py + 63); g.lineTo(82, py + 70); g.lineTo(85, py + 80); g.lineTo(76, py + 74); g.lineTo(67, py + 80); g.lineTo(70, py + 70); g.lineTo(62, py + 63); g.lineTo(72, py + 62); g.fill(); }
          if (deadT > 1) text(room ? 'TAP FOR MENU' : 'TAP TO PLAY', W / 2, py + 150, 12);
        }
        g.restore();
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, W, H); }
      };
      let acc = 0;
      ctx.loop(dt => {
        acc += dt;
        // A fixed step keeps every jump the same height at any frame rate.
        while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; }
        flash = Math.max(0, flash - dt * 4); shake *= Math.exp(-dt * 9);
        draw();
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
        if (me.alive && Math.random() < dt * .8) st.burst(mine.position.clone().setX(mine.position.x + me.face * me.s), 0xdff6ff, 1, 3, 30);
        for (const w of weeds) w.rotation.z = Math.sin(t * 1.2 + w.userData.p) * .09;
        hud.replaceChildren(el('span', {}, 'Size ', el('b', {}, Math.floor(me.s))), el('span', {}, 'Eaten ', el('b', {}, eaten)));
        st.render(dt);
      });
    }
  },
});
