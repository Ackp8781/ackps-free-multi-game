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
      const st = Gfx.stage(ctx, { top: '#3f8fe6', bottom: '#ffd9b0', fog: [0xffc9a0, 90, 320], fov: 65, near: .1, far: 700, shadow: 34, hemi: .8, sunDir: [.5, 1, .4], reserve: 170 });
      const { wrap, canvas, scene, camera } = st;
      const tip = el('div', { class: 'tag3d' });
      wrap.append(tip);
      ctx.help('WASD or arrows to move, Space to jump, drag the view to turn the camera.');
      ctx.touch([['←', 'a'], ['▲', 'w'], ['▼', 's'], ['→', 'd'], ['⤒', ' ']]);

      const r = rng(seed), boxes = [];
      const COLORS = [0x3fa7ff, 0x3fe0c5, 0xffd23f, 0xb07bff, 0x7bed9f, 0xff9f43];
      const add = (x, y, z, w, h, d, color, extra = {}) => {
        const glow = extra.kill ? { emissive: 0xff2200, emissiveIntensity: .7 } : extra.goal ? { metalness: .7, roughness: .25, emissive: 0x553a00 } : { roughness: .4 };
        const m = Gfx.box(w, h, d, new THREE.MeshStandardMaterial({ color, ...glow }), x, y, z);
        scene.add(m);
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
          const f = Gfx.Models.flag(0x3fe0c5); f.position.set(cx + 3.5, cy, cz - 3.5); scene.add(f);
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
      const trophy = Gfx.group(Gfx.cyl(.7, .9, .4, Gfx.mat(0x8a6a10), 0, .2, 0), Gfx.cyl(.15, .15, 1, Gfx.mat(0xffc400, { metalness: .9, roughness: .2 }), 0, .9, 0), Gfx.cyl(1, .4, 1.3, Gfx.mat(0xffc400, { metalness: .9, roughness: .2 }), 0, 2, 0));
      trophy.position.set(cx, cy, cz - 3); scene.add(trophy);
      const minY = -14;
      const lavaTex = (() => {
        const c = el('canvas', { width: 128, height: 128 }), g = c.getContext('2d'), n = rng(7);
        g.fillStyle = '#e8430f'; g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 90; i++) { g.fillStyle = ['#ff8a1a', '#ffc13b', '#b82a08'][i % 3]; g.beginPath(); g.arc(n() * 128, n() * 128, 2 + n() * 9, 0, 7); g.fill(); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70);
        return t;
      })();
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ map: lavaTex }));
      lava.rotation.x = -Math.PI / 2; lava.position.y = minY - 6; lava.position.z = cz / 2; scene.add(lava);
      for (let i = 0; i < 26; i++) {
        const c = Gfx.Models.cloud(); c.scale.setScalar(4 + r() * 6);
        c.position.set((r() - .5) * 160, 16 + r() * 30, cz * r()); scene.add(c);
      }

      const avatar = (shirt, pants) => { const g = Gfx.Models.avatar(shirt, pants); scene.add(g); return g; };
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
        if (done) { st.render(dt); return; }
        time += dt;
        lavaTex.offset.x += dt * .03; lavaTex.offset.y += dt * .018;
        trophy.rotation.y += dt;
        st.follow(pl.x, pl.y, pl.z);
        for (const b of boxes) if (b.swing) {
          const nx = b.base + Math.sin(time * b.speed + b.phase) * b.swing;
          b.dx = nx - b.x; b.x = nx; b.m.position.x = nx;
        }
        const k = ctx.keys;
        const fw = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
        const strafe = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
        const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
        let mx = -sin * fw + cos * strafe, mz = -cos * fw - sin * strafe;
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
        st.render(dt);
      });
    }
  },
});
