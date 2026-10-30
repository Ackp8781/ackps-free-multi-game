// Block Party Obby: an original 3D obstacle course, plus a link to the real Roblox.
App.register({
  id: 'obby', name: 'Block Party Obby', icon: '🟥', online: true,
  desc: 'A Roblox-style 3D obstacle course, plus a link to real Roblox.',
  fmtBest: b => b + 's',
  mount(ctx) {
    ctx.lobby({ intro: 'First to the gold platform wins. Red blocks are lava.', start: play,
      extra: [{ label: 'Open real Roblox (new tab)', fn: () => window.open('https://www.roblox.com/discover', '_blank', 'noopener') }] });

    async function play(room, seed) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const wrap = el('div', { class: 'game3d' });
      ctx.stage.append(wrap);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      const canvas = renderer.domElement;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      wrap.append(canvas);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x8fd3ff);
      const camera = new THREE.PerspectiveCamera(65, 16 / 9, .1, 400);
      const size = () => {
        const w = wrap.clientWidth, h = Math.min(w * 9 / 16, innerHeight - 170);
        renderer.setSize(w, h, false); canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix();
      };
      size();
      ctx.on(window, 'resize', size);
      ctx.add(() => { renderer.dispose(); renderer.forceContextLoss(); });
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6677aa, .95));
      const sun = new THREE.DirectionalLight(0xffffff, .6); sun.position.set(30, 60, 20); scene.add(sun);
      const tip = el('div', { class: 'tag3d' });
      wrap.append(tip);
      ctx.help('WASD or arrows to move, Space to jump, drag the view to turn the camera.');
      ctx.touch([['←', 'a'], ['▲', 'w'], ['▼', 's'], ['→', 'd'], ['⤒', ' ']]);

      const r = rng(seed), boxes = [];
      const COLORS = [0x3fa7ff, 0x3fe0c5, 0xffd23f, 0xb07bff, 0x7bed9f, 0xff9f43];
      const add = (x, y, z, w, h, d, color, extra = {}) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
        m.position.set(x, y, z); scene.add(m);
        const b = { m, x, y, z, w, h, d, dx: 0, dz: 0, ...extra };
        boxes.push(b);
        return b;
      };
      add(0, -1, 0, 16, 2, 16, 0x7bd17b);
      const checkpoints = [{ x: 0, y: 2, z: 0 }];
      let cx = 0, cy = 0, cz = -8;
      const COUNT = 32;
      for (let i = 1; i <= COUNT; i++) {
        const hard = i / COUNT, type = i % 8 === 0 ? 'check' : r();
        const gap = 3.5 + r() * (1.5 + hard * 1.5);
        cz -= gap + 2; cx += (r() - .5) * 8; cy += (r() - .35) * 1.6;
        if (type === 'check') {
          cz -= 2;
          add(cx, cy - .5, cz, 9, 1, 9, 0xffffff, { check: true });
          checkpoints.push({ x: cx, y: cy + 2, z: cz });
          cz -= 2;
        } else if (type < .25 + hard * .1) {
          add(cx, cy - .4, cz, 4, .8, 4, 0xff3b3b, { kill: false, color: 0x777777 }).m.material.color.setHex(COLORS[i % 6]);
          add(cx, cy + .1, cz, 1.2, .3, 1.2, 0xff2a2a, { kill: true });
        } else if (type < .55) {
          add(cx, cy - .4, cz, 4, .8, 4, COLORS[i % 6], { swing: 2 + r() * 3, speed: 1 + r() * 1.2, phase: r() * 6, base: cx });
        } else {
          const s = 4.2 - hard * 1.6;
          add(cx, cy - .4, cz, s, .8, s, COLORS[i % 6]);
        }
      }
      cz -= 7;
      add(cx, cy - .5, cz, 12, 1, 12, 0xffc400, { goal: true });
      const minY = -14;
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
      lava.rotation.x = -Math.PI / 2; lava.position.y = minY - 6; scene.add(lava);

      const avatar = (shirt, pants) => {
        const g = new THREE.Group(), m = c => new THREE.MeshLambertMaterial({ color: c });
        const part = (w, h, d, c, x, y) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c)); p.position.set(x, y, 0); g.add(p); return p; };
        part(.9, .9, .5, shirt, 0, 1.25);
        part(.5, .5, .5, 0xffd23f, 0, 1.95);
        const armL = part(.35, .9, .4, 0xffd23f, -.65, 1.25), armR = part(.35, .9, .4, 0xffd23f, .65, 1.25);
        const legL = part(.42, .85, .45, pants, -.23, .42), legR = part(.42, .85, .45, pants, .23, .42);
        g.userData = { armL, armR, legL, legR };
        scene.add(g);
        return g;
      };
      const pl = { x: 0, y: 2, z: 0, vx: 0, vz: 0, vy: 0, ground: false, ride: null, cp: 0, face: 0, deaths: 0 };
      const body = avatar(0xff5d8f, 0x2d3a66);
      let camYaw = 0, camPitch = .42, drag = null, time = 0, done = false, walk = 0;
      const others = {};
      ctx.on(canvas, 'pointerdown', e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
      ctx.on(canvas, 'pointermove', e => {
        if (!drag) return;
        camYaw -= (e.clientX - drag[0]) * .006; camPitch = clamp(camPitch + (e.clientY - drag[1]) * .004, .08, 1.3);
        drag = [e.clientX, e.clientY];
      });
      ctx.on(canvas, 'pointerup', () => { drag = null; });
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'o') {
            const o = others[from] || (others[from] = avatar(0x5ab0ff, 0x444444));
            o.position.set(d.x, d.y, d.z); o.rotation.y = d.f;
          }
          if (d.t === 'win' && !done) {
            const p = room.players.find(x => x.id === from);
            done = true;
            ctx.message(`${p ? p.name : 'Someone'} won!`, `They finished in ${d.s} seconds.`, [{ label: 'Back to menu', fn: ctx.restart }]);
          }
          if (d.t === 'left' && others[from]) { scene.remove(others[from]); delete others[from]; }
        }));
        ctx.every(66, () => room.send({ t: 'o', x: pl.x, y: pl.y, z: pl.z, f: pl.face }));
      }
      const respawn = () => {
        const c = checkpoints[pl.cp];
        pl.x = c.x; pl.y = c.y; pl.z = c.z; pl.vy = 0; pl.deaths++;
      };
      const HW = .45, HH = 2.2;
      ctx.loop(dt => {
        if (done) { renderer.render(scene, camera); return; }
        time += dt;
        for (const b of boxes) if (b.swing) {
          const nx = b.base + Math.sin(time * b.speed + b.phase) * b.swing;
          b.dx = nx - b.x; b.x = nx; b.m.position.x = nx;
        }
        const k = ctx.keys;
        const fw = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
        const st = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
        const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
        let mx = -sin * fw + cos * st, mz = -cos * fw - sin * st;
        const l = Math.hypot(mx, mz);
        if (l) { mx /= l; mz /= l; pl.face = Math.atan2(-mx, -mz); walk += dt * 11; }
        if (k.has(' ') && pl.ground) { pl.vy = 13.5; pl.ground = false; }
        pl.vy = Math.max(pl.vy - 34 * dt, -50);
        if (pl.ride && pl.ground) pl.x += pl.ride.dx;
        pl.x += mx * 11 * dt; pl.z += mz * 11 * dt;
        const prevY = pl.y;
        pl.y += pl.vy * dt;
        pl.ground = false; pl.ride = null;
        for (const b of boxes) {
          const inX = Math.abs(pl.x - b.x) < b.w / 2 + HW, inZ = Math.abs(pl.z - b.z) < b.d / 2 + HW;
          if (!inX || !inZ) continue;
          const topY = b.y + b.h / 2, botY = b.y - b.h / 2;
          if (pl.y < topY && pl.y + HH > botY) {
            if (b.kill) { respawn(); break; }
            if (pl.vy <= 0 && prevY >= topY - .35) {
              pl.y = topY; pl.vy = 0; pl.ground = true; pl.ride = b.swing ? b : null;
              if (b.check) { const i = checkpoints.findIndex(c => Math.abs(c.z - b.z) < .01); if (i > pl.cp) pl.cp = i; }
              if (b.goal && !done) {
                done = true;
                const s = Math.round(time * 10) / 10, nb = ctx.score(s, true);
                if (room) room.send({ t: 'win', s });
                ctx.message('You finished!', `${s} seconds, ${pl.deaths} falls.${nb ? ' New best!' : ''}`, room ? [{ label: 'Back to menu', fn: ctx.restart }] : [{ label: 'New course', fn: () => play(null, Math.floor(Math.random() * 1e9)) }]);
              }
            } else if (pl.vy > 0 && prevY + HH <= botY + .4) { pl.y = botY - HH; pl.vy = 0; }
            else {
              const ox = b.w / 2 + HW - Math.abs(pl.x - b.x), oz = b.d / 2 + HW - Math.abs(pl.z - b.z);
              if (ox < oz) pl.x += ox * Math.sign(pl.x - b.x); else pl.z += oz * Math.sign(pl.z - b.z);
            }
          }
        }
        if (pl.y < minY) respawn();
        body.position.set(pl.x, pl.y, pl.z); body.rotation.y = pl.face;
        const sw = l ? Math.sin(walk) * .7 : 0, u = body.userData;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw; u.armR.rotation.x = sw;
        const dist = 12;
        camera.position.set(pl.x + sin * Math.cos(camPitch) * dist, pl.y + 1.5 + Math.sin(camPitch) * dist, pl.z + cos * Math.cos(camPitch) * dist);
        camera.lookAt(pl.x, pl.y + 1.5, pl.z);
        tip.textContent = `⏱ ${time.toFixed(1)}s · 🚩 Checkpoint ${pl.cp + 1}/${checkpoints.length} · 💀 ${pl.deaths}`;
        renderer.render(scene, camera);
      });
    }
  },
});
