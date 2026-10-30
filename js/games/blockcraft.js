// BlockCraft: a voxel sandbox. Worlds come from a seed, so online players only exchange edits.
App.register({
  id: 'craft', name: 'BlockCraft', icon: '⛏️', online: true,
  desc: 'A blocky 3D sandbox. Dig and build alone or with friends.',
  async mount(ctx) {
    ctx.lobby({ intro: 'Solo worlds save automatically. Online worlds last for the session.', start: (room, seed) => play(room, seed) });

    async function play(room, seedIn) {
      ctx.clear();
      await loadThree();
      if (!ctx.stage.isConnected) return;
      const seed = room ? seedIn : ctx.data('seed', seedIn);
      if (!room) ctx.save('seed', seed);
      const SX = 96, SZ = 96, SY = 40, CH = 16;
      const BLOCKS = {
        1: { name: 'Grass', top: 0x62b846, side: 0x8a6b3e, bot: 0x7a5a32 }, 2: { name: 'Dirt', all: 0x7a5a32 }, 3: { name: 'Stone', all: 0x8a8d91 },
        4: { name: 'Wood', all: 0x6e4f2c }, 5: { name: 'Leaves', all: 0x2f8a3a }, 6: { name: 'Sand', all: 0xe0cf8f },
        7: { name: 'Planks', all: 0xb98d52 }, 8: { name: 'Brick', all: 0xa8483a }, 9: { name: 'Glass', all: 0xb8e6f2 },
      };
      const BAR = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const world = new Uint8Array(SX * SY * SZ);
      const id = (x, y, z) => x + z * SX + y * SX * SZ;
      const get = (x, y, z) => (x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ || y >= SY ? 0 : world[id(x, y, z)]);
      const solidAt = (x, y, z) => (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0 ? 1 : y >= SY ? 0 : world[id(x, y, z)]);

      const lat = {};
      const val = (x, z, s) => {
        const k = x + ',' + z + ',' + s;
        return lat[k] === undefined ? (lat[k] = rng(seed + x * 73856 + z * 19349 + s * 83492)()) : lat[k];
      };
      const noise = (x, z, s, cell) => {
        const a = x / cell, b = z / cell, i = Math.floor(a), j = Math.floor(b), u = a - i, v = b - j;
        const f = t => t * t * (3 - 2 * t), fu = f(u), fv = f(v);
        return (val(i, j, s) * (1 - fu) + val(i + 1, j, s) * fu) * (1 - fv) + (val(i, j + 1, s) * (1 - fu) + val(i + 1, j + 1, s) * fu) * fv;
      };
      const height = (x, z) => Math.floor(9 + noise(x, z, 1, 24) * 14 + noise(x, z, 2, 8) * 4);
      const treeR = rng(seed + 5);
      for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
        const h = height(x, z);
        for (let y = 0; y <= h; y++) world[id(x, y, z)] = y === h ? (h < 13 ? 6 : 1) : y > h - 3 ? (h < 13 ? 6 : 2) : 3;
      }
      for (let n = 0; n < 90; n++) {
        const x = 3 + Math.floor(treeR() * (SX - 6)), z = 3 + Math.floor(treeR() * (SZ - 6)), h = height(x, z);
        if (h < 14) continue;
        const tall = 4 + Math.floor(treeR() * 2);
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let y = h + tall - 2; y <= h + tall + 1; y++) {
          if (Math.abs(a) + Math.abs(b) + (y - h - tall) < 4) world[id(x + a, y, z + b)] = 5;
        }
        for (let y = h + 1; y <= h + tall; y++) world[id(x, y, z)] = 4;
      }
      const edits = room ? {} : ctx.data('edits', {});
      for (const k in edits) world[+k] = edits[k];

      const st = Gfx.stage(ctx, { top: '#4c9fe8', bottom: '#cfeeff', fog: [0xbfe4f7, 45, 110], fov: 72, near: .1, far: 400, shadow: 40, hemi: .72, sunPower: .75, sunDir: [.5, 1, .3], reserve: 170 });
      const { wrap, canvas, scene, camera } = st;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(SX + 400, SZ + 400), new THREE.MeshStandardMaterial({ color: 0x2f8fd6, transparent: true, opacity: .72, roughness: .12, metalness: .2 }));
      water.rotation.x = -Math.PI / 2; water.position.set(SX / 2, 12.6, SZ / 2); scene.add(water);
      const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
      sunBall.position.set(SX / 2 + 110, 210, SZ / 2 + 66); scene.add(sunBall);
      const clouds = [];
      const cr = rng(seed + 9), cloudM = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .9, fog: false });
      for (let i = 0; i < 24; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(8 + cr() * 22, 2.5, 8 + cr() * 18), cloudM);
        c.position.set(cr() * (SX + 200) - 100, 62 + cr() * 8, cr() * (SZ + 200) - 100); scene.add(c); clouds.push(c);
      }

      const tc = document.createElement('canvas'); tc.width = tc.height = 16;
      const tg = tc.getContext('2d'), nr = rng(9);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = 200 + Math.floor(nr() * 55); tg.fillStyle = `rgb(${v},${v},${v})`; tg.fillRect(x, y, 1, 1); }
      const tex = new THREE.CanvasTexture(tc);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });

      const FACES = [
        { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 'side' }, { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 'side' },
        { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 'top' }, { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 'bot' },
        { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 'side' }, { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 'side' },
      ];
      const chunks = new Map();
      const tmpCol = new THREE.Color();
      function buildChunk(cx, cz) {
        const pos = [], nor = [], col = [], uv = [], idx = [];
        for (let x = cx * CH; x < (cx + 1) * CH && x < SX; x++) for (let z = cz * CH; z < (cz + 1) * CH && z < SZ; z++) for (let y = 0; y < SY; y++) {
          const b = world[id(x, y, z)];
          if (!b) continue;
          const d = BLOCKS[b];
          for (const f of FACES) {
            if (get(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
            const v0 = pos.length / 3;
            tmpCol.setHex(d.all !== undefined ? d.all : d[f.s]);
            for (const c of f.c) {
              // Corner shading: darken a vertex for each solid block touching it on the open side.
              const o = [0, 1, 2].map(a => (f.n[a] ? f.n[a] : c[a] ? 1 : -1));
              const ax = f.n[0] ? 1 : 0, bx = f.n[2] ? 1 : 2;
              const at = (ua, ub) => {
                const p = [x + f.n[0], y + f.n[1], z + f.n[2]];
                if (ua) p[ax] += o[ax];
                if (ub) p[bx] += o[bx];
                return get(p[0], p[1], p[2]) ? 1 : 0;
              };
              const ao = 1 - .17 * (at(1, 0) + at(0, 1) + at(1, 1));
              pos.push(x + c[0], y + c[1], z + c[2]); nor.push(...f.n); col.push(tmpCol.r * ao, tmpCol.g * ao, tmpCol.b * ao);
            }
            uv.push(0, 0, 1, 0, 1, 1, 0, 1);
            idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
          }
        }
        const key = cx + ',' + cz, old = chunks.get(key);
        if (old) { scene.remove(old); old.geometry.dispose(); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh); chunks.set(key, mesh);
      }
      for (let cx = 0; cx * CH < SX; cx++) for (let cz = 0; cz * CH < SZ; cz++) buildChunk(cx, cz);
      const rebuildAt = (x, z) => {
        const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
        buildChunk(cx, cz);
        if (x % CH === 0 && cx > 0) buildChunk(cx - 1, cz);
        if (x % CH === CH - 1 && (cx + 1) * CH < SX) buildChunk(cx + 1, cz);
        if (z % CH === 0 && cz > 0) buildChunk(cx, cz - 1);
        if (z % CH === CH - 1 && (cz + 1) * CH < SZ) buildChunk(cx, cz + 1);
      };
      const setBlock = (x, y, z, b, net = true) => {
        const i = id(x, y, z);
        world[i] = b; edits[i] = b;
        rebuildAt(x, z);
        if (net && room) room.send({ t: 'set', x, y, z, b });
      };

      const pl = { x: SX / 2 + .5, y: 0, z: SZ / 2 + .5, vy: 0, yaw: 0, pitch: -.2, ground: false, fly: false };
      let top = SY - 1;
      while (top > 0 && !get(Math.floor(pl.x), top, Math.floor(pl.z))) top--;
      pl.y = top + 1.2;
      const saved = !room && ctx.data('pos');
      if (saved) Object.assign(pl, saved);
      const HW = .3, HH = 1.75, EYE = 1.6;
      const blocked = (x, y, z) => {
        for (let a = Math.floor(x - HW); a <= Math.floor(x + HW); a++) for (let b = Math.floor(y); b <= Math.floor(y + HH); b++) for (let c = Math.floor(z - HW); c <= Math.floor(z + HW); c++) if (solidAt(a, b, c)) return true;
        return false;
      };

      const cross = el('div', { class: 'cross' }, '+');
      const hotbar = el('div', { class: 'hotbar' });
      const tip = el('div', { class: 'tag3d' });
      wrap.append(cross, hotbar, tip);
      let slot = 0, locked = false;
      const drawBar = () => {
        hotbar.replaceChildren(...BAR.map((b, i) => {
          const d = BLOCKS[b], hex = d.all !== undefined ? d.all : d.top;
          return el('span', { class: i === slot ? 'on' : '', title: d.name, style: 'background:#' + hex.toString(16).padStart(6, '0') });
        }));
        tip.textContent = `${BLOCKS[BAR[slot]].name} · F: fly${pl.fly ? ' (on)' : ''}`;
      };
      drawBar();
      ctx.help('Click the view to capture the mouse (Esc to release). WASD to move, Space to jump, left click or Q to break, right click or E to place, 1-9 or wheel to choose a block, F to fly.');

      const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005)), new THREE.LineBasicMaterial({ color: 0x000000 }));
      sel.visible = false; scene.add(sel);
      const dirVec = () => new THREE.Vector3(Math.sin(pl.yaw) * Math.cos(pl.pitch) * -1, Math.sin(pl.pitch), -Math.cos(pl.yaw) * Math.cos(pl.pitch));
      const ray = () => {
        const d = dirVec();
        let x = pl.x, y = pl.y + EYE, z = pl.z, px = Math.floor(x), py = Math.floor(y), pz = Math.floor(z);
        for (let t = 0; t < 6; t += .04) {
          const a = Math.floor(x + d.x * t), b = Math.floor(y + d.y * t), c = Math.floor(z + d.z * t);
          if (a === px && b === py && c === pz) continue;
          if (get(a, b, c)) return { hit: [a, b, c], prev: [px, py, pz] };
          px = a; py = b; pz = c;
        }
        return null;
      };
      // First-person arm that swings on every action.
      scene.add(camera);
      const arm = Gfx.box(.16, .16, .6, Gfx.mat(0xf2c79b), .42, -.36, -.55);
      arm.castShadow = false; camera.add(arm);
      let swing = 0, stride = 0;
      const act = button => {
        swing = 1;
        const r = ray();
        if (!r) return;
        if (button === 0) {
          if (r.hit[1] > 0) {
            const d = BLOCKS[get(...r.hit)], at = new THREE.Vector3(r.hit[0] + .5, r.hit[1] + .5, r.hit[2] + .5);
            st.burst(at, d.all !== undefined ? d.all : d.top, 14, .16, 3.5); Sfx.play('dig');
            setBlock(...r.hit, 0);
          }
        }
        else if (button === 2) {
          const [x, y, z] = r.prev;
          if (x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ || y >= SY) return;
          const inMe = x + 1 > pl.x - HW && x < pl.x + HW && y + 1 > pl.y && y < pl.y + HH && z + 1 > pl.z - HW && z < pl.z + HW;
          if (!inMe) { setBlock(x, y, z, BAR[slot]); Sfx.play('place'); }
        }
      };
      let drag = null;
      ctx.on(canvas, 'contextmenu', e => e.preventDefault());
      ctx.on(canvas, 'pointerdown', e => {
        if (locked) { act(e.button); return; }
        drag = { x: e.clientX, y: e.clientY };
        if (e.pointerType !== 'mouse' || !canvas.requestPointerLock) return;
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      });
      ctx.on(document, 'pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
      const look = (dx, dy) => { pl.yaw -= dx * .0028; pl.pitch = clamp(pl.pitch - dy * .0028, -1.55, 1.55); };
      ctx.on(document, 'pointermove', e => {
        if (locked) look(e.movementX, e.movementY);
        else if (drag) { look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
      });
      ctx.on(document, 'pointerup', () => { drag = null; });
      ctx.on(canvas, 'wheel', e => { e.preventDefault(); slot = (slot + (e.deltaY > 0 ? 1 : BAR.length - 1)) % BAR.length; drawBar(); }, { passive: false });
      ctx.on(window, 'keydown', e => {
        if (/^[1-9]$/.test(e.key)) { slot = +e.key - 1; drawBar(); }
        if (e.key.toLowerCase() === 'f' && !e.repeat) { pl.fly = !pl.fly; pl.vy = 0; drawBar(); }
        if (e.key.toLowerCase() === 'q' && !e.repeat) act(0);
        if (e.key.toLowerCase() === 'e' && !e.repeat) act(2);
      });
      ctx.touch([['←', 'a'], ['▲', 'w'], ['▼', 's'], ['→', 'd'], ['⤒', ' '], ['⛏', 'q'], ['🧱', 'e']]);
      ctx.add(() => { if (document.pointerLockElement === canvas) document.exitPointerLock(); });

      const others = {};
      const avatar = () => {
        const g = Gfx.Models.avatar(0x3f7fd1, 0x2d3a66, 0xf2c79b);
        g.scale.setScalar(.72);
        scene.add(g);
        return g;
      };
      if (room) {
        ctx.add(room.onMessage((d, from) => {
          if (d.t === 'set') setBlock(d.x, d.y, d.z, d.b, false);
          if (d.t === 'p') { const o = others[from] || (others[from] = avatar()); o.position.set(d.x, d.y, d.z); o.rotation.y = d.yaw; }
          if (d.t === 'left' && others[from]) { scene.remove(others[from]); delete others[from]; }
        }));
        ctx.every(66, () => room.send({ t: 'p', x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw }));
      } else {
        const persist = () => { ctx.save('edits', edits); ctx.save('pos', { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, pitch: pl.pitch }); };
        ctx.every(5000, persist);
        ctx.add(persist);
      }

      ctx.loop(dt => {
        for (const c of clouds) { c.position.x += dt * .9; if (c.position.x > SX + 110) c.position.x = -110; }
        st.follow(pl.x, pl.y, pl.z);
        const k = ctx.keys, sp = pl.fly ? 11 : 5;
        const fw = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
        const strafe = (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
        const sin = Math.sin(pl.yaw), cos = Math.cos(pl.yaw);
        const mx = (-sin * fw + cos * strafe) * sp * dt, mz = (-cos * fw - sin * strafe) * sp * dt;
        if (!blocked(pl.x + mx, pl.y, pl.z)) pl.x += mx;
        if (!blocked(pl.x, pl.y, pl.z + mz)) pl.z += mz;
        if (pl.fly) {
          const up = (k.has(' ') ? 1 : 0) - (k.has('Shift') ? 1 : 0), my = up * sp * dt;
          if (!blocked(pl.x, pl.y + my, pl.z)) pl.y += my;
        } else {
          if (k.has(' ') && pl.ground) { pl.vy = 7.6; pl.ground = false; Sfx.play('jump'); }
          pl.vy = Math.max(pl.vy - 22 * dt, -30);
          const my = pl.vy * dt;
          if (blocked(pl.x, pl.y + my, pl.z)) { if (pl.vy < -9) { Sfx.play('land'); st.shake(.12); } if (pl.vy < 0) pl.ground = true; pl.vy = 0; } else { pl.y += my; pl.ground = false; }
        }
        const moving = (fw || strafe) && (pl.ground || pl.fly);
        if (moving) stride += dt * 10;
        const bob = moving ? Math.sin(stride) * .05 : 0;
        if (moving && !pl.fly && Math.sin(stride) * Math.sin(stride - dt * 10) < 0) Sfx.play('skid');
        swing = Math.max(0, swing - dt * 5);
        arm.rotation.x = -Math.sin(swing * Math.PI) * 1.1;
        arm.position.y = -.36 + bob * .5;
        camera.position.set(pl.x, pl.y + EYE + bob, pl.z);
        camera.rotation.set(pl.pitch, pl.yaw, 0, 'YXZ');
        const r = ray();
        sel.visible = !!r;
        if (r) sel.position.set(r.hit[0] + .5, r.hit[1] + .5, r.hit[2] + .5);
        st.render(dt);
      });
    }
  },
});
